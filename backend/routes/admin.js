const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
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
            User.find().select("role"),
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
            createdAt: u.createdAt,
        }));
        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        return fail(res, 500, "Could not load users.");
    }
});

// GET /api/admin/doctors  (includes hidden / unapproved doctors)
router.get("/doctors", async(req, res) => {
    try {
        const doctors = await Doctor.find().sort({ createdAt: -1 });
        return res.json({ success: true, count: doctors.length, data: doctors });
    } catch (error) {
        return fail(res, 500, "Could not load doctors.");
    }
});

// POST /api/admin/doctors  { name, email, specialty, city?, experience?, consultationFee?, password? }
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

module.exports = router;