const express = require("express");
const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Review = require("../models/Review");
const requireAuth = require("../middleware/auth");
const { patientTimes, worksOn } = require("../utils/schedule");
const pdf = require('../utils/pdf');
const notify = require("../utils/notify");

const router = express.Router();

// ---------- clinic rules (change these if you like) ----------
// Opening hours / slot length / lunch break are now set PER DOCTOR (see utils/schedule.js)
const MAX_DAYS_AHEAD = 30;
const MIN_LEAD_MINUTES = 30; // can't book a slot starting in less than 30 min
const CANCEL_CUTOFF_MINUTES = 120; // can cancel / reschedule up to 2 hours before
const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

// ---------- small helpers ----------
// Today's date in India, "YYYY-MM-DD"
function todayIST() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isValidDate(dateStr) {
    if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function startAtFor(date, time) {
    return new Date(`${date}T${time}:00${IST_OFFSET}`);
}

// Returns an error message if the date can't be booked, otherwise null
function dateProblem(date) {
    if (!isValidDate(date)) return "Please choose a valid date.";
    const today = todayIST();
    if (date < today) return "You can't book a past date.";
    if (date > addDays(today, MAX_DAYS_AHEAD)) {
        return `You can book up to ${MAX_DAYS_AHEAD} days ahead.`;
    }
    return null;
}

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

// Checks date + time against this doctor's schedule. Returns an error message or null.
function slotProblem(doctor, date, time) {
    const problem = dateProblem(date);
    if (problem) return problem;
    if (!worksOn(doctor, date)) return "This doctor doesn't work on that day.";
    if (typeof time !== "string" || !patientTimes(doctor).includes(time)) return "Please choose a valid time slot.";
    if (startAtFor(date, time).getTime() < Date.now() + MIN_LEAD_MINUTES * 60000) {
        return "That time is too soon or already passed.";
    }
    return null;
}

// a doctor patients are allowed to book
const bookable = (doctor) => doctor && doctor.approved !== false;

// every route below needs a logged-in user
router.use(requireAuth);

// ---------- GET /api/appointments/slots?doctorId=...&date=YYYY-MM-DD ----------
router.get("/slots", async(req, res) => {
    try {
        const { doctorId, date } = req.query;

        if (!mongoose.isValidObjectId(doctorId)) return fail(res, 400, "Invalid doctor.");
        const problem = dateProblem(date);
        if (problem) return fail(res, 400, problem);

        const doctor = await Doctor.findById(doctorId);
        if (!bookable(doctor)) return fail(res, 404, "Doctor not found.");
        if (!doctor.available) return fail(res, 409, "This doctor is currently unavailable.");

        if (!worksOn(doctor, date)) {
            return res.json({ success: true, data: { date, slots: [], closed: true } });
        }

        const booked = await Appointment.find({ doctor: doctor._id, date, active: true }).select("time");
        const taken = new Set(booked.map((a) => a.time));
        const earliest = Date.now() + MIN_LEAD_MINUTES * 60000;

        const slots = patientTimes(doctor).filter(
            (time) => !taken.has(time) && startAtFor(date, time).getTime() >= earliest
        );

        return res.json({ success: true, data: { date, slots, closed: false } });
    } catch (error) {
        console.error("Slots error:", error.message);
        return fail(res, 500, "Could not load time slots.");
    }
});

// ---------- POST /api/appointments  { doctorId, date, time, reason } ----------
router.post("/", async(req, res) => {
    try {
        if (req.userRole !== "patient") {
            return fail(res, 403, "Only patient accounts can book appointments.");
        }

        const { doctorId, date, time, reason } = req.body;

        if (!mongoose.isValidObjectId(doctorId)) return fail(res, 400, "Invalid doctor.");
        if (reason !== undefined && (typeof reason !== "string" || reason.length > 300)) {
            return fail(res, 400, "Reason must be under 300 characters.");
        }

        const doctor = await Doctor.findById(doctorId);
        if (!bookable(doctor)) return fail(res, 404, "Doctor not found.");
        if (!doctor.available) return fail(res, 409, "This doctor is currently unavailable.");

        const problem = slotProblem(doctor, date, time);
        if (problem) return fail(res, 400, problem);

        const startAt = startAtFor(date, time);

        // one person can't be in two places at once
        const clash = await Appointment.exists({ patient: req.userId, startAt, active: true });
        if (clash) return fail(res, 409, "You already have an appointment at this time.");

        let appointment;
        try {
            appointment = await Appointment.create({
                patient: req.userId,
                doctor: doctor._id,
                date,
                time,
                startAt,
                reason: (reason || "").trim(),
                fee: doctor.consultationFee,
            });
        } catch (error) {
            // 11000 = unique index said "this slot is already taken"
            if (error.code === 11000) {
                return fail(res, 409, "Sorry, that slot was just booked by someone else. Please pick another time.");
            }
            throw error;
        }

        const patient = await User.findById(req.userId).select("name email");
        if (patient) notify.bookingConfirmed(appointment, patient, doctor);

        await appointment.populate("doctor", "name specialty");
        return res.status(201).json({
            success: true,
            message: "Appointment booked successfully.",
            data: appointment,
        });
    } catch (error) {
        console.error("Book error:", error.message);
        return fail(res, 500, "Could not book the appointment. Please try again.");
    }
});

// ---------- GET /api/appointments/me ----------
router.get("/me", async(req, res) => {
    try {
        const appointments = await Appointment.find({ patient: req.userId })
            .sort({ startAt: -1 })
            .populate("doctor", "name specialty");

        const now = Date.now();
        const data = appointments.map((a) => {
            const changeable = a.status === "booked" && a.startAt.getTime() - now >= CANCEL_CUTOFF_MINUTES * 60000;
            return {
                ...a.toObject(),
                canCancel: changeable,
                canReschedule: changeable,
                canReview: a.status === "completed" && !a.reviewed,
                canPay: a.status === "booked" && a.paymentStatus === "unpaid" && a.fee > 0,
                canReceipt: a.paymentStatus === "paid",
                canAttach: a.status === "booked",
            };
        });

        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("My appointments error:", error.message);
        return fail(res, 500, "Could not load your appointments.");
    }
});

// ---------- GET /api/appointments/:id/receipt  (PDF, only after online payment) ----------
router.get("/:id/receipt", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");

        const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.userId });
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.paymentStatus !== "paid") return fail(res, 409, "A receipt is available after an online payment.");

        const [patient, doctor] = await Promise.all([
            User.findById(req.userId).select("name email"),
            Doctor.findById(appointment.doctor),
        ]);

        const paidOn = appointment.paidAt ?
            new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(appointment.paidAt) :
            "-";
        const receiptNo = "MC-" + String(appointment._id).slice(-8).toUpperCase();

        const pdf = makePdf([
            { text: "MediConnect", size: 24, bold: true, gap: 4 },
            { text: "Payment receipt", size: 14, gap: 10 },
            { rule: true },
            { text: `Receipt no: ${receiptNo}` },
            { text: `Paid on: ${paidOn} (IST)` },
            { text: `Payment id: ${appointment.paymentId || "-"}`, gap: 14 },
            { text: "Patient", bold: true, gap: 4 },
            { text: `${patient ? patient.name : "-"}  (${patient ? patient.email : "-"})`, gap: 14 },
            { text: "Consultation", bold: true, gap: 4 },
            { text: `${doctor ? doctor.name : "Doctor"}${doctor && doctor.specialty ? " - " + doctor.specialty : ""}`, gap: 4 },
            { text: `Visit: ${appointment.date} at ${appointment.time} (IST)`, gap: 14 },
            { rule: true },
            { text: `Amount paid: Rs ${appointment.fee}`, size: 16, bold: true, gap: 12 },
            { text: "Paid online with Razorpay. Thank you for choosing MediConnect.", size: 10 },
            { text: "This is a computer-generated receipt and needs no signature.", size: 10 },
        ], { title: `Receipt ${receiptNo}` });

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="receipt-${receiptNo}.pdf"`,
            "Cache-Control": "private, no-store",
        });
        return res.end(pdf);
    } catch (error) {
        console.error("Receipt error:", error.message);
        return fail(res, 500, "Could not create the receipt.");
    }
});

// ---------- PATCH /api/appointments/:id/cancel ----------
router.patch("/:id/cancel", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");

        // filtering by patient means you can only ever cancel YOUR OWN appointment
        const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.userId });
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.status === "cancelled") return fail(res, 409, "This appointment is already cancelled.");
        if (appointment.status !== "booked") return fail(res, 409, `This appointment is already ${appointment.status}.`);

        const minutesLeft = (appointment.startAt.getTime() - Date.now()) / 60000;
        if (minutesLeft < CANCEL_CUTOFF_MINUTES) {
            return fail(res, 409, `Appointments can only be cancelled up to ${CANCEL_CUTOFF_MINUTES / 60} hours before the visit.`);
        }

        appointment.status = "cancelled";
        appointment.active = false; // frees the slot for other people
        appointment.cancelledAt = new Date();
        appointment.cancelledBy = "patient";
        if (appointment.paymentStatus === "paid") appointment.paymentStatus = "refund-pending";
        await appointment.save();

        const [patient, doctor] = await Promise.all([
            User.findById(req.userId).select("name email"),
            Doctor.findById(appointment.doctor),
        ]);
        if (patient && doctor) notify.cancelled(appointment, patient, doctor, "patient");

        return res.json({ success: true, message: "Appointment cancelled.", data: appointment });
    } catch (error) {
        console.error("Cancel error:", error.message);
        return fail(res, 500, "Could not cancel the appointment.");
    }
});

// ---------- PATCH /api/appointments/:id/reschedule  { date, time } ----------
router.patch("/:id/reschedule", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");

        const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.userId });
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.status !== "booked") return fail(res, 409, "Only upcoming appointments can be rescheduled.");

        const minutesLeft = (appointment.startAt.getTime() - Date.now()) / 60000;
        if (minutesLeft < CANCEL_CUTOFF_MINUTES) {
            return fail(res, 409, `Appointments can only be changed up to ${CANCEL_CUTOFF_MINUTES / 60} hours before the visit.`);
        }

        const { date, time } = req.body;
        const doctor = await Doctor.findById(appointment.doctor);
        if (!bookable(doctor)) return fail(res, 404, "Doctor not found.");
        if (!doctor.available) return fail(res, 409, "This doctor is currently unavailable.");

        const problem = slotProblem(doctor, date, time);
        if (problem) return fail(res, 400, problem);

        const startAt = startAtFor(date, time);
        if (startAt.getTime() === appointment.startAt.getTime()) {
            return fail(res, 400, "That is already your appointment time.");
        }

        const clash = await Appointment.exists({
            patient: req.userId,
            startAt,
            active: true,
            _id: { $ne: appointment._id },
        });
        if (clash) return fail(res, 409, "You already have an appointment at this time.");

        appointment.date = date;
        appointment.time = time;
        appointment.startAt = startAt;
        appointment.reminderSent = false;

        try {
            await appointment.save(); // the unique index protects the new slot too
        } catch (error) {
            if (error.code === 11000) {
                return fail(res, 409, "Sorry, that slot was just booked by someone else. Please pick another time.");
            }
            throw error;
        }

        const patient = await User.findById(req.userId).select("name email");
        if (patient) notify.rescheduled(appointment, patient, doctor);

        return res.json({ success: true, message: "Appointment rescheduled.", data: appointment });
    } catch (error) {
        console.error("Reschedule error:", error.message);
        return fail(res, 500, "Could not reschedule the appointment.");
    }
});

// ---------- POST /api/appointments/:id/review  { rating, comment } ----------
router.post("/:id/review", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");

        const rating = Number(req.body.rating);
        const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 400, "Please give 1 to 5 stars.");
        if (comment.length > 400) return fail(res, 400, "Comment must be under 400 characters.");

        const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.userId });
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.status !== "completed") return fail(res, 409, "You can review a visit after it is completed.");
        if (appointment.reviewed) return fail(res, 409, "You already reviewed this visit.");

        try {
            await Review.create({
                appointment: appointment._id,
                patient: req.userId,
                doctor: appointment.doctor,
                rating,
                comment,
            });
        } catch (error) {
            if (error.code === 11000) return fail(res, 409, "You already reviewed this visit.");
            throw error;
        }

        appointment.reviewed = true;
        await appointment.save();

        // recompute the doctor's average from real reviews
        const all = await Review.find({ doctor: appointment.doctor });
        const doctor = await Doctor.findById(appointment.doctor);
        if (doctor && all.length) {
            const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
            doctor.rating = Math.round(avg * 10) / 10;
            doctor.reviewCount = all.length;
            await doctor.save();
        }

        return res.status(201).json({ success: true, message: "Thanks for your review!" });
    } catch (error) {
        console.error("Review error:", error.message);
        return fail(res, 500, "Could not save your review.");
    }
});

module.exports = router;