const express = require("express");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const requireAuth = require("../middleware/auth");
const requireDoctor = require("../middleware/doctor");
const User = require("../models/User");
const { scheduleOf, validateSchedule } = require("../utils/schedule");
const notify = require("../utils/notify");

const router = express.Router();

const TIME_ZONE = "Asia/Kolkata";

// Today's date in India, "YYYY-MM-DD"
function todayIST() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

// Only what the doctor needs: patient NAME and the reason. No email, no password.
function shape(a) {
    return {
        _id: a._id,
        date: a.date,
        time: a.time,
        startAt: a.startAt,
        reason: a.reason,
        status: a.status,
        cancelledBy: a.cancelledBy,
        patient: a.patient && a.patient.name ? { name: a.patient.name } : null,
    };
}

// every route below needs a logged-in DOCTOR
router.use(requireAuth, requireDoctor);

// ---------- GET /api/doctor/summary ----------
router.get("/summary", async(req, res) => {
    try {
        const today = todayIST();
        const now = Date.now();

        const all = await Appointment.find({ doctor: req.doctor._id }).select("date status startAt");

        const summary = {
            today: all.filter((a) => a.date === today && a.status !== "cancelled").length,
            upcoming: all.filter((a) => a.status === "booked" && a.startAt.getTime() > now).length,
            completed: all.filter((a) => a.status === "completed").length,
            missedOrCancelled: all.filter((a) => a.status === "no-show" || a.status === "cancelled").length,
        };

        return res.json({
            success: true,
            data: {
                doctor: {
                    name: req.doctor.name,
                    specialty: req.doctor.specialty,
                    available: req.doctor.available,
                    approved: req.doctor.approved !== false,
                },
                summary,
            },
        });
    } catch (error) {
        console.error("Doctor summary error:", error.message);
        return fail(res, 500, "Could not load the dashboard.");
    }
});

// ---------- GET /api/doctor/appointments?scope=today|upcoming|history ----------
router.get("/appointments", async(req, res) => {
    try {
        const scope = ["today", "upcoming", "history"].includes(req.query.scope) ?
            req.query.scope :
            "today";
        const today = todayIST();

        const all = await Appointment.find({ doctor: req.doctor._id })
            .sort({ startAt: 1 })
            .populate("patient", "name");

        let list;
        if (scope === "today") {
            list = all.filter((a) => a.date === today);
        } else if (scope === "upcoming") {
            list = all.filter((a) => a.date > today && a.status === "booked");
        } else {
            // history: older days, plus anything finished or cancelled. Newest first.
            list = all
                .filter((a) => a.date < today || ["completed", "no-show", "cancelled"].includes(a.status))
                .reverse()
                .slice(0, 100);
        }

        return res.json({ success: true, count: list.length, data: list.map(shape) });
    } catch (error) {
        console.error("Doctor appointments error:", error.message);
        return fail(res, 500, "Could not load appointments.");
    }
});

// ---------- PATCH /api/doctor/appointments/:id/status  { status } ----------
// status: "completed" | "no-show" | "cancelled"
router.patch("/appointments/:id/status", async(req, res) => {
    try {
        const { status } = req.body;

        if (!["completed", "no-show", "cancelled"].includes(status)) {
            return fail(res, 400, "Status must be completed, no-show or cancelled.");
        }
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");

        // filtering by doctor means you can only change YOUR OWN appointments
        const appointment = await Appointment.findOne({ _id: req.params.id, doctor: req.doctor._id });
        if (!appointment) return fail(res, 404, "Appointment not found.");

        if (appointment.status !== "booked") {
            return fail(res, 409, `This appointment is already ${appointment.status}.`);
        }

        const started = appointment.startAt.getTime() <= Date.now();

        if ((status === "completed" || status === "no-show") && !started) {
            return fail(res, 409, "You can mark this only after the appointment time has started.");
        }
        if (status === "cancelled" && started) {
            return fail(res, 409, "This appointment has already started, so it can't be cancelled.");
        }

        appointment.status = status;
        appointment.active = false; // frees the slot
        if (status === "cancelled") {
            appointment.cancelledAt = new Date();
            appointment.cancelledBy = "doctor";
            if (appointment.paymentStatus === "paid") appointment.paymentStatus = "refund-pending";
        }
        await appointment.save();

        if (status === "cancelled") {
            const patient = await User.findById(appointment.patient).select("name email");
            if (patient) notify.cancelled(appointment, patient, req.doctor, "doctor");
        }

        return res.json({ success: true, message: `Marked as ${status}.`, data: { _id: appointment._id, status: appointment.status } });
    } catch (error) {
        console.error("Doctor status error:", error.message);
        return fail(res, 500, "Could not update the appointment.");
    }
});

// ---------- PATCH /api/doctor/availability  { available: true|false } ----------
// When false, patients can no longer book this doctor.
router.patch("/availability", async(req, res) => {
    try {
        if (typeof req.body.available !== "boolean") {
            return fail(res, 400, "available must be true or false.");
        }

        req.doctor.available = req.body.available;
        await req.doctor.save();

        return res.json({ success: true, data: { available: req.doctor.available } });
    } catch (error) {
        console.error("Availability error:", error.message);
        return fail(res, 500, "Could not update availability.");
    }
});

// what the doctor can see/edit about their own public profile
function profileOf(d) {
    return {
        name: d.name,
        specialty: d.specialty,
        city: d.city || "",
        about: d.about || "",
        experience: d.experience,
        consultationFee: d.consultationFee,
        image: d.image || "",
        rating: d.rating,
        reviewCount: d.reviewCount || 0,
        available: d.available,
        approved: d.approved !== false,
        schedule: scheduleOf(d),
    };
}

// ---------- GET /api/doctor/profile ----------
router.get("/profile", (req, res) => {
    res.json({ success: true, data: profileOf(req.doctor) });
});

// ---------- PATCH /api/doctor/profile ----------
// Doctors can edit: fee, experience, city, about, photo. (Name/specialty are changed by an admin.)
router.patch("/profile", async(req, res) => {
    try {
        const { consultationFee, experience, city, about, image } = req.body;
        const d = req.doctor;

        if (consultationFee !== undefined) {
            const fee = Number(consultationFee);
            if (!Number.isFinite(fee) || fee < 0 || fee > 100000) return fail(res, 400, "Fee must be between 0 and 100000.");
            d.consultationFee = Math.round(fee);
        }
        if (experience !== undefined) {
            const years = Number(experience);
            if (!Number.isFinite(years) || years < 0 || years > 70) return fail(res, 400, "Experience must be between 0 and 70 years.");
            d.experience = Math.round(years);
        }
        if (city !== undefined) {
            if (typeof city !== "string" || city.length > 60) return fail(res, 400, "City must be under 60 characters.");
            d.city = city.trim();
        }
        if (about !== undefined) {
            if (typeof about !== "string" || about.length > 500) return fail(res, 400, "About must be under 500 characters.");
            d.about = about.trim();
        }
        if (image !== undefined) {
            if (typeof image !== "string" || image.length > 300 || (image && !/^https?:\/\//i.test(image))) {
                return fail(res, 400, "Photo must be a link starting with http:// or https://");
            }
            d.image = image.trim();
        }

        await d.save();
        return res.json({ success: true, message: "Profile saved.", data: profileOf(d) });
    } catch (error) {
        console.error("Profile error:", error.message);
        return fail(res, 500, "Could not save the profile.");
    }
});

// ---------- PATCH /api/doctor/schedule ----------
// { workingDays:[1,2,3], startTime:"09:00", endTime:"18:00", slotMinutes:20, breakStart:"13:00", breakEnd:"14:00" }
// Existing appointments are NOT touched; the new hours apply to new bookings.
router.patch("/schedule", async(req, res) => {
    try {
        const { error, value } = validateSchedule(req.body);
        if (error) return fail(res, 400, error);

        req.doctor.schedule = value;
        await req.doctor.save();
        return res.json({ success: true, message: "Schedule saved.", data: scheduleOf(req.doctor) });
    } catch (error) {
        console.error("Schedule error:", error.message);
        return fail(res, 500, "Could not save the schedule.");
    }
});

module.exports = router;