const express = require("express");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");
const { scheduleOf } = require("../utils/schedule");
const { roomUrl, windowFor } = require("../utils/video");

const router = express.Router();
const fail = (res, status, message) => res.status(status).json({ success: false, message });

const TIME_ZONE = "Asia/Kolkata";
const clock = (d) =>
    new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(d);

router.use(requireAuth);

// ---------- GET /api/video/:appointmentId ----------
// Gives the video-call link, but ONLY to the patient or the doctor of that appointment,
// only while it is upcoming, and only inside the join window.
router.get("/:appointmentId", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.appointmentId)) return fail(res, 404, "Appointment not found.");

        let appointment;
        let doctor;
        let name;

        if (req.userRole === "patient") {
            appointment = await Appointment.findOne({ _id: req.params.appointmentId, patient: req.userId });
            if (!appointment) return fail(res, 404, "Appointment not found.");
            doctor = await Doctor.findById(appointment.doctor);
            const user = await User.findById(req.userId).select("name");
            name = (user && user.name) || "Patient";
        } else if (req.userRole === "doctor") {
            doctor = await Doctor.findOne({ user: req.userId });
            if (!doctor) return fail(res, 404, "Appointment not found.");
            appointment = await Appointment.findOne({ _id: req.params.appointmentId, doctor: doctor._id });
            if (!appointment) return fail(res, 404, "Appointment not found.");
            name = doctor.name;
        } else {
            return fail(res, 403, "Video calls are only for the patient and the doctor.");
        }

        if (appointment.walkIn || !appointment.patient) return fail(res, 409, "Walk-in visits have no video call.");
        if (appointment.status !== "booked") return fail(res, 409, "This appointment is not upcoming, so there is no video call.");

        const slotMinutes = doctor ? scheduleOf(doctor).slotMinutes : 30;
        const { opensAt, closesAt } = windowFor(appointment, slotMinutes);
        const now = Date.now();

        if (now < opensAt.getTime()) {
            return fail(res, 409, `The video call opens at ${clock(opensAt)} (10 minutes before the visit).`);
        }
        if (now > closesAt.getTime()) {
            return fail(res, 409, "The video call window for this visit has ended.");
        }

        return res.json({ success: true, data: { url: roomUrl(appointment._id, name), opensAt, closesAt } });
    } catch (error) {
        console.error("Video error:", error.message);
        return fail(res, 500, "Could not start the video call.");
    }
});

module.exports = router;