const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const Attachment = require("../models/Attachment");
const notify = require("../utils/notify");
const requireAuth = require("../middleware/auth");
const requireAdmin = require("../middleware/admin");

const router = express.Router();
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// every route below needs a logged-in ADMIN
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats
router.get("/stats", async(req, res) => {
    try {
        const [users, doctors, appointments] = await Promise.all([
            User.find().select("role blocked"),
            Doctor.find(),
            Appointment.find().select("status paymentStatus fee"),
        ]);

        const count = (list, fn) => list.filter(fn).length;
        return res.json({
            success: true,
            data: {
                patients: count(users, (u) => (u.role || "patient") === "patient"),
                doctors: doctors.length,
                pendingDoctors: count(doctors, (d) => d.approved === false),
                appointments: appointments.length,
                booked: count(appointments, (a) => a.status === "booked"),
                completed: count(appointments, (a) => a.status === "completed"),
                cancelled: count(appointments, (a) => a.status === "cancelled"),
                noShow: count(appointments, (a) => a.status === "no-show"),
                revenue: appointments.filter((a) => a.paymentStatus === "paid").reduce((s, a) => s + (a.fee || 0), 0),
                refundsPending: count(appointments, (a) => a.paymentStatus === "refund-pending"),
                refundsDone: count(appointments, (a) => a.paymentStatus === "refunded"),
                blockedUsers: count(users, (u) => u.blocked === true),
            },
        });
    } catch (error) {
        console.error("Admin stats error:", error.message);
        return fail(res, 500, "Could not load stats.");
    }
});

// GET /api/admin/users   (never returns passwords)
router.get("/users", async(req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        const data = users.slice(0, 200).map((u) => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            role: u.role || "patient",
            blocked: u.blocked === true,
            createdAt: u.createdAt,
        }));
        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        return fail(res, 500, "Could not load users.");
    }
});

// PATCH /api/admin/users/:id  { blocked: true|false }
// A blocked person can't log in and their old login token stops working at once.
// Blocking a doctor also hides the doctor from patients (an admin must approve again after unblocking).
router.patch("/users/:id", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "User not found.");
        if (typeof req.body.blocked !== "boolean") return fail(res, 400, "blocked must be true or false.");

        const user = await User.findById(req.params.id);
        if (!user) return fail(res, 404, "User not found.");
        if (String(user._id) === req.userId) return fail(res, 400, "You can't block your own account.");
        if (user.role === "admin") return fail(res, 400, "Admin accounts can't be blocked here.");

        user.blocked = req.body.blocked;
        await user.save();

        if (user.blocked && user.role === "doctor") {
            const doctor = await Doctor.findOne({ user: user._id });
            if (doctor && doctor.approved !== false) {
                doctor.approved = false;
                await doctor.save();
            }
        }

        return res.json({
            success: true,
            message: user.blocked ? `${user.name} is blocked.` : `${user.name} is unblocked.`,
            data: { blocked: user.blocked },
        });
    } catch (error) {
        console.error("Admin block error:", error.message);
        return fail(res, 500, "Could not update the user.");
    }
});

// GET /api/admin/doctors  (includes hidden / unapproved doctors)
router.get("/doctors", async(req, res) => {
    try {
        const doctors = await Doctor.find().sort({ createdAt: -1 });
        const credentials = await Attachment.find({ kind: "credential" }).select("-data");
        const withFile = new Set(credentials.map((c) => String(c.doctor)));
        const data = doctors.map((d) => ({...(d.toObject ? d.toObject() : d), hasCredential: withFile.has(String(d._id)) }));
        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        return fail(res, 500, "Could not load doctors.");
    }
});

// POST /api/admin/doctors  { name, email, specialty, city?, experience?, consultationFee?, password? }
// Creates the doctor profile AND the doctor's login. If no password is given, a temporary one is generated
// and returned ONCE (the doctor can change it with "Forgot password").
router.post("/doctors", async(req, res) => {
    let createdUser = null;
    try {
        const { name, email, specialty, city, experience, consultationFee } = req.body;

        if (typeof name !== "string" || name.trim().length < 2 || typeof specialty !== "string" || !specialty.trim()) {
            return fail(res, 400, "Name and specialty are required.");
        }
        if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return fail(res, 400, "A valid email is required.");
        }
        const fee = consultationFee === undefined || consultationFee === "" ? 500 : Number(consultationFee);
        const exp = experience === undefined || experience === "" ? 1 : Number(experience);
        if (!Number.isFinite(fee) || fee < 0 || fee > 100000) return fail(res, 400, "Fee must be between 0 and 100000.");
        if (!Number.isFinite(exp) || exp < 0 || exp > 70) return fail(res, 400, "Experience must be between 0 and 70.");

        let password = req.body.password;
        let tempPassword = null;
        if (password === undefined || password === "") {
            tempPassword = crypto.randomBytes(6).toString("base64url") + "9a";
            password = tempPassword;
        } else if (typeof password !== "string" || password.length < 8 || password.length > 72) {
            return fail(res, 400, "Password must be 8–72 characters long.");
        }

        const cleanEmail = email.trim().toLowerCase();
        if (await User.findOne({ email: cleanEmail })) return fail(res, 409, "An account with this email already exists.");

        createdUser = await User.create({
            name: name.trim(),
            email: cleanEmail,
            password: await bcrypt.hash(password, 12),
            role: "doctor",
        });

        const doctor = await Doctor.create({
            name: name.trim(),
            specialty: specialty.trim(),
            city: typeof city === "string" ? city.trim().slice(0, 60) : "",
            experience: Math.round(exp),
            consultationFee: Math.round(fee),
            approved: true,
            user: createdUser._id,
        });

        return res.status(201).json({
            success: true,
            message: "Doctor created.",
            data: { doctor, login: { email: cleanEmail, tempPassword } },
        });
    } catch (error) {
        if (createdUser) await User.deleteOne({ _id: createdUser._id }).catch(() => {});
        if (error.code === 11000) return fail(res, 409, "An account with this email already exists.");
        console.error("Admin create doctor error:", error.message);
        return fail(res, 500, "Could not create the doctor.");
    }
});

// PATCH /api/admin/doctors/:id  { approved: true|false }
router.patch("/doctors/:id", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Doctor not found.");
        if (typeof req.body.approved !== "boolean") return fail(res, 400, "approved must be true or false.");

        const doctor = await Doctor.findById(req.params.id);
        if (!doctor) return fail(res, 404, "Doctor not found.");

        doctor.approved = req.body.approved;
        await doctor.save();
        return res.json({ success: true, message: doctor.approved ? "Doctor approved." : "Doctor hidden from patients.", data: { approved: doctor.approved } });
    } catch (error) {
        return fail(res, 500, "Could not update the doctor.");
    }
});

// GET /api/admin/doctors/:id/credential  (the doctor's uploaded degree / registration certificate)
router.get("/doctors/:id/credential", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Doctor not found.");
        const file = await Attachment.findOne({ kind: "credential", doctor: req.params.id }).select("+data");
        if (!file) return fail(res, 404, "This doctor has not uploaded a document yet.");

        res.set({
            "Content-Type": file.mime,
            "Content-Disposition": `attachment; filename="${file.name}"`,
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, no-store",
        });
        return res.end(Buffer.from(file.data));
    } catch (error) {
        console.error("Credential download error:", error.message);
        return fail(res, 500, "Could not download the document.");
    }
});

// GET /api/admin/appointments  (latest 50)
router.get("/appointments", async(req, res) => {
    try {
        const list = await Appointment.find()
            .sort({ startAt: -1 })
            .populate("patient", "name")
            .populate("doctor", "name");
        const data = list.slice(0, 50).map((a) => ({
            _id: a._id,
            date: a.date,
            time: a.time,
            status: a.status,
            fee: a.fee,
            paymentStatus: a.paymentStatus,
            patient: a.patient && a.patient.name,
            doctor: a.doctor && a.doctor.name,
        }));
        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        return fail(res, 500, "Could not load appointments.");
    }
});

// ---------- refunds ----------
// Cancelling a PAID visit makes it "refund-pending". The clinic sends the money back from the
// Razorpay dashboard (Payments -> the payment -> Refund), then marks it "refunded" here.
const refundRow = (a) => ({
    _id: a._id,
    date: a.date,
    time: a.time,
    fee: a.fee,
    paymentStatus: a.paymentStatus,
    paymentId: a.paymentId || "",
    refundedAt: a.refundedAt || null,
    patient: a.patient && a.patient.name,
    patientEmail: a.patient && a.patient.email,
    doctor: a.doctor && a.doctor.name,
});

const refundList = async() => {
    const list = await Appointment.find().sort({ startAt: -1 }).populate("patient", "name email").populate("doctor", "name");
    return list.filter((a) => a.paymentStatus === "refund-pending" || a.paymentStatus === "refunded");
};

// GET /api/admin/refunds  (pending first)
router.get("/refunds", async(req, res) => {
    try {
        const rows = (await refundList()).map(refundRow);
        rows.sort((x, y) => (x.paymentStatus === y.paymentStatus ? 0 : x.paymentStatus === "refund-pending" ? -1 : 1));
        return res.json({ success: true, count: rows.length, data: rows.slice(0, 100) });
    } catch (error) {
        return fail(res, 500, "Could not load refunds.");
    }
});

// PATCH /api/admin/appointments/:id/refund  -> marks a pending refund as done
router.patch("/appointments/:id/refund", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.paymentStatus !== "refund-pending") return fail(res, 409, "This appointment has no pending refund.");

        appointment.paymentStatus = "refunded";
        appointment.refundedAt = new Date();
        await appointment.save();

        const [patient, doctor] = await Promise.all([
            User.findById(appointment.patient).select("name email"),
            Doctor.findById(appointment.doctor),
        ]);
        if (patient && doctor) notify.refunded(appointment, patient, doctor);

        return res.json({ success: true, message: "Marked as refunded. The patient was emailed.", data: { paymentStatus: appointment.paymentStatus } });
    } catch (error) {
        console.error("Refund mark error:", error.message);
        return fail(res, 500, "Could not update the refund.");
    }
});

// ---------- CSV downloads ----------
// A cell that starts with = + - @ could run as a formula in Excel, so it gets a leading '
function csvCell(value) {
    let text = value === undefined || value === null ? "" : value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const toCsv = (columns, rows) =>
    "﻿" + [columns.map((c) => c[0]).join(","), ...rows.map((r) => columns.map((c) => csvCell(c[1](r))).join(","))].join("\r\n") + "\r\n";

const EXPORTS = {
    appointments: {
        filter: () => true,
        columns: [
            ["Date", (a) => a.date],
            ["Time", (a) => a.time],
            ["Status", (a) => a.status],
            ["Patient", (a) => (a.patient && a.patient.name) || a.walkInName],
            ["Patient email", (a) => a.patient && a.patient.email],
            ["Doctor", (a) => a.doctor && a.doctor.name],
            ["Fee (Rs)", (a) => a.fee],
            ["Payment", (a) => a.paymentStatus],
            ["Walk-in", (a) => (a.walkIn ? "yes" : "no")],
        ],
    },
    payments: {
        filter: (a) => ["paid", "refund-pending", "refunded"].includes(a.paymentStatus),
        columns: [
            ["Visit date", (a) => a.date],
            ["Time", (a) => a.time],
            ["Patient", (a) => a.patient && a.patient.name],
            ["Doctor", (a) => a.doctor && a.doctor.name],
            ["Amount (Rs)", (a) => a.fee],
            ["Payment", (a) => a.paymentStatus],
            ["Payment id", (a) => a.paymentId],
            ["Paid at", (a) => a.paidAt],
            ["Refunded at", (a) => a.refundedAt],
        ],
    },
    refunds: {
        filter: (a) => a.paymentStatus === "refund-pending" || a.paymentStatus === "refunded",
        columns: [
            ["Visit date", (a) => a.date],
            ["Time", (a) => a.time],
            ["Patient", (a) => a.patient && a.patient.name],
            ["Patient email", (a) => a.patient && a.patient.email],
            ["Doctor", (a) => a.doctor && a.doctor.name],
            ["Amount (Rs)", (a) => a.fee],
            ["Status", (a) => a.paymentStatus],
            ["Payment id", (a) => a.paymentId],
            ["Refunded at", (a) => a.refundedAt],
        ],
    },
};

// GET /api/admin/export/appointments | payments | refunds   (downloads a .csv file)
router.get("/export/:type", async(req, res) => {
    try {
        const spec = EXPORTS[req.params.type];
        if (!spec) return fail(res, 404, "Unknown export.");

        const all = await Appointment.find().sort({ startAt: -1 }).populate("patient", "name email").populate("doctor", "name");
        const csv = toCsv(spec.columns, all.filter(spec.filter));

        res.set({
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="mediconnect-${req.params.type}.csv"`,
            "Cache-Control": "private, no-store",
        });
        return res.send(csv);
    } catch (error) {
        console.error("Export error:", error.message);
        return fail(res, 500, "Could not create the file.");
    }
});

module.exports = router;