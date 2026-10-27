const express = require("express");
const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// ---------- clinic rules (change these if you like) ----------
const OPEN_TIME = "10:00";
const CLOSE_TIME = "17:00";
const SLOT_MINUTES = 30;
const BREAK_START = "13:00"; // lunch: no slots from 13:00 to 14:00
const BREAK_END = "14:00";
const MAX_DAYS_AHEAD = 30;
const MIN_LEAD_MINUTES = 30; // can't book a slot starting in less than 30 min
const CANCEL_CUTOFF_MINUTES = 120; // can cancel up to 2 hours before the visit
const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

// ---------- small helpers ----------
const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
};

const pad = (n) => String(n).padStart(2, "0");

// All possible times in a day, e.g. ["10:00", "10:30", ...] (lunch removed)
function allTimes() {
    const times = [];
    for (let m = toMinutes(OPEN_TIME); m + SLOT_MINUTES <= toMinutes(CLOSE_TIME); m += SLOT_MINUTES) {
        const overlapsBreak = m < toMinutes(BREAK_END) && m + SLOT_MINUTES > toMinutes(BREAK_START);
        if (overlapsBreak) continue;
        times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    }
    return times;
}

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
        if (!doctor) return fail(res, 404, "Doctor not found.");
        if (!doctor.available) return fail(res, 409, "This doctor is currently unavailable.");

        const booked = await Appointment.find({ doctor: doctor._id, date, active: true }).select("time");
        const taken = new Set(booked.map((a) => a.time));
        const earliest = Date.now() + MIN_LEAD_MINUTES * 60000;

        const slots = allTimes().filter(
            (time) => !taken.has(time) && startAtFor(date, time).getTime() >= earliest
        );

        return res.json({ success: true, data: { date, slots } });
    } catch (error) {
        console.error("Slots error:", error.message);
        return fail(res, 500, "Could not load time slots.");
    }
});

// ---------- POST /api/appointments  { doctorId, date, time, reason } ----------
router.post("/", async(req, res) => {
    try {
        if (req.userRole === "doctor") {
            return fail(res, 403, "Doctor accounts can't book appointments. Please use a patient account.");
        }

        const { doctorId, date, time, reason } = req.body;

        if (!mongoose.isValidObjectId(doctorId)) return fail(res, 400, "Invalid doctor.");
        const problem = dateProblem(date);
        if (problem) return fail(res, 400, problem);
        if (typeof time !== "string" || !allTimes().includes(time)) {
            return fail(res, 400, "Please choose a valid time slot.");
        }
        if (reason !== undefined && (typeof reason !== "string" || reason.length > 300)) {
            return fail(res, 400, "Reason must be under 300 characters.");
        }

        const startAt = startAtFor(date, time);
        if (startAt.getTime() < Date.now() + MIN_LEAD_MINUTES * 60000) {
            return fail(res, 400, "That time is too soon or already passed.");
        }

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) return fail(res, 404, "Doctor not found.");
        if (!doctor.available) return fail(res, 409, "This doctor is currently unavailable.");

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
        const data = appointments.map((a) => ({
            ...a.toObject(),
            canCancel: a.status === "booked" &&
                a.startAt.getTime() - now >= CANCEL_CUTOFF_MINUTES * 60000,
        }));

        return res.json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("My appointments error:", error.message);
        return fail(res, 500, "Could not load your appointments.");
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

        const minutesLeft = (appointment.startAt.getTime() - Date.now()) / 60000;
        if (minutesLeft < CANCEL_CUTOFF_MINUTES) {
            return fail(res, 409, `Appointments can only be cancelled up to ${CANCEL_CUTOFF_MINUTES / 60} hours before the visit.`);
        }

        appointment.status = "cancelled";
        appointment.active = false; // frees the slot for other people
        appointment.cancelledAt = new Date();
        await appointment.save();

        return res.json({ success: true, message: "Appointment cancelled.", data: appointment });
    } catch (error) {
        console.error("Cancel error:", error.message);
        return fail(res, 500, "Could not cancel the appointment.");
    }
});

module.exports = router;