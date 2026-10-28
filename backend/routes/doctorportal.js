const express = require("express");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Attachment = require("../models/Attachment");
const DoctorNote = require("../models/DoctorNote");
const requireAuth = require("../middleware/auth");
const requireDoctor = require("../middleware/doctor");
const User = require("../models/User");
const { scheduleOf, validateSchedule, allTimes, worksOn } = require("../utils/schedule");
const { readUpload } = require("../utils/files");
const notify = require("../utils/notify");

const router = express.Router();

const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";
const MAX_DAYS_AHEAD = 30;

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

const startAtFor = (date, time) => new Date(`${date}T${time}:00${IST_OFFSET}`);

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

// Only what the doctor needs: patient NAME and the reason. No email, no password.
function shape(a) {
    const name = (a.patient && a.patient.name) || a.walkInName;
    return {
        _id: a._id,
        date: a.date,
        time: a.time,
        startAt: a.startAt,
        reason: a.reason,
        status: a.status,
        cancelledBy: a.cancelledBy,
        followUpDate: a.followUpDate || "",
        walkIn: Boolean(a.walkIn),
        walkInPhone: a.walkIn ? a.walkInPhone || "" : "",
        patient: name ? { name } : null,
    };
}

const noteShape = (n, appointmentId) => ({
    _id: n._id,
    text: n.text,
    createdAt: n.createdAt,
    thisVisit: String(n.appointment) === String(appointmentId),
});

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

// ---------- PATCH /api/doctor/appointments/:id/status  { status, followUpDate? } ----------
// status: "completed" | "no-show" | "cancelled"
// followUpDate ("YYYY-MM-DD", only with "completed"): the doctor suggests the next visit.
router.patch("/appointments/:id/status", async(req, res) => {
    try {
        const { status, followUpDate } = req.body;

        if (!["completed", "no-show", "cancelled"].includes(status)) {
            return fail(res, 400, "Status must be completed, no-show or cancelled.");
        }
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");

        let followUp = "";
        if (followUpDate !== undefined && followUpDate !== "") {
            const today = todayIST();
            if (status !== "completed") return fail(res, 400, "A follow-up can only be suggested when completing a visit.");
            if (!isValidDate(followUpDate) || followUpDate <= today || followUpDate > addDays(today, 365)) {
                return fail(res, 400, "Please choose a follow-up date in the future (within a year).");
            }
            followUp = followUpDate;
        }

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
        if (followUp) appointment.followUpDate = followUp;
        await appointment.save();

        // walk-in visits have no patient account, so there is nobody to email
        if (appointment.patient && (status === "cancelled" || followUp)) {
            const patient = await User.findById(appointment.patient).select("name email");
            if (patient && status === "cancelled") notify.cancelled(appointment, patient, req.doctor, "doctor");
            if (patient && followUp) notify.followUp(appointment, patient, req.doctor);
        }

        return res.json({ success: true, message: `Marked as ${status}.`, data: { _id: appointment._id, status: appointment.status } });
    } catch (error) {
        console.error("Doctor status error:", error.message);
        return fail(res, 500, "Could not update the appointment.");
    }
});

// ---------- GET /api/doctor/appointments/:id/history ----------
// The patient's earlier visits WITH THIS DOCTOR, the doctor's private notes, and the reports
// the patient attached to this appointment.
router.get("/appointments/:id/history", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");
        const appt = await Appointment.findOne({ _id: req.params.id, doctor: req.doctor._id }).populate("patient", "name");
        if (!appt) return fail(res, 404, "Appointment not found.");

        let visits = [];
        let notes;
        if (appt.patient) {
            const patientId = appt.patient._id || appt.patient;
            const past = await Appointment.find({ doctor: req.doctor._id, patient: patientId }).sort({ startAt: -1 });
            visits = past
                .filter((v) => String(v._id) !== String(appt._id))
                .slice(0, 20)
                .map((v) => ({ _id: v._id, date: v.date, time: v.time, status: v.status, reason: v.reason, followUpDate: v.followUpDate || "" }));
            notes = await DoctorNote.find({ doctor: req.doctor._id, patient: patientId }).sort({ createdAt: -1 });
        } else {
            notes = await DoctorNote.find({ doctor: req.doctor._id, appointment: appt._id }).sort({ createdAt: -1 });
        }

        const reports = await Attachment.find({ appointment: appt._id, kind: "report" }).select("-data");

        return res.json({
            success: true,
            data: {
                patient: { name: (appt.patient && appt.patient.name) || appt.walkInName || "Patient" },
                visits,
                notes: notes.slice(0, 50).map((n) => noteShape(n, appt._id)),
                reports: reports.map((r) => ({ _id: r._id, name: r.name, size: r.size })),
            },
        });
    } catch (error) {
        console.error("History error:", error.message);
        return fail(res, 500, "Could not load the patient history.");
    }
});

// ---------- POST /api/doctor/appointments/:id/notes  { text } ----------
router.post("/appointments/:id/notes", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Appointment not found.");
        const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
        if (!text) return fail(res, 400, "Please write a note first.");
        if (text.length > 1000) return fail(res, 400, "A note can be up to 1000 characters.");

        const appt = await Appointment.findOne({ _id: req.params.id, doctor: req.doctor._id });
        if (!appt) return fail(res, 404, "Appointment not found.");

        const note = await DoctorNote.create({
            doctor: req.doctor._id,
            patient: appt.patient || undefined,
            appointment: appt._id,
            text,
        });
        return res.status(201).json({ success: true, message: "Note saved.", data: noteShape(note, appt._id) });
    } catch (error) {
        console.error("Note error:", error.message);
        return fail(res, 500, "Could not save the note.");
    }
});

// ---------- DELETE /api/doctor/notes/:id ----------
router.delete("/notes/:id", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Note not found.");
        const note = await DoctorNote.findOne({ _id: req.params.id, doctor: req.doctor._id });
        if (!note) return fail(res, 404, "Note not found.");
        await DoctorNote.deleteOne({ _id: note._id });
        return res.json({ success: true, message: "Note deleted." });
    } catch (error) {
        return fail(res, 500, "Could not delete the note.");
    }
});

// ---------- GET /api/doctor/earnings ----------
// Based on completed visits (the visit fee). "paidOnline" = the part patients already paid through the app.
router.get("/earnings", async(req, res) => {
    try {
        const all = await Appointment.find({ doctor: req.doctor._id }).select("date status fee paymentStatus startAt");
        const now = Date.now();
        const sum = (list) => list.reduce((s, a) => s + (a.fee || 0), 0);

        const completed = all.filter((a) => a.status === "completed");
        const upcoming = all.filter((a) => a.status === "booked" && a.startAt.getTime() > now);

        const byMonth = new Map();
        for (const a of completed) {
            const key = a.date.slice(0, 7); // "2026-10"
            const row = byMonth.get(key) || { month: key, visits: 0, amount: 0 };
            row.visits += 1;
            row.amount += a.fee || 0;
            byMonth.set(key, row);
        }
        const months = [...byMonth.values()].sort((x, y) => (x.month < y.month ? 1 : -1)).slice(0, 12);
        const thisKey = todayIST().slice(0, 7);
        const thisMonth = byMonth.get(thisKey) || { month: thisKey, visits: 0, amount: 0 };

        return res.json({
            success: true,
            data: {
                completedVisits: completed.length,
                completedAmount: sum(completed),
                thisMonthVisits: thisMonth.visits,
                thisMonthAmount: thisMonth.amount,
                paidOnline: sum(all.filter((a) => a.paymentStatus === "paid")),
                upcomingVisits: upcoming.length,
                upcomingAmount: sum(upcoming),
                months,
            },
        });
    } catch (error) {
        console.error("Earnings error:", error.message);
        return fail(res, 500, "Could not load your earnings.");
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
async function profileOf(d) {
    const credential = await Attachment.findOne({ kind: "credential", doctor: d._id }).select("-data");
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
        registrationNumber: d.registrationNumber || "",
        credential: credential ? { name: credential.name, size: credential.size, createdAt: credential.createdAt } : null,
        schedule: scheduleOf(d),
    };
}

// ---------- GET /api/doctor/profile ----------
router.get("/profile", async(req, res) => {
    try {
        res.json({ success: true, data: await profileOf(req.doctor) });
    } catch (error) {
        fail(res, 500, "Could not load the profile.");
    }
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
        return res.json({ success: true, message: "Profile saved.", data: await profileOf(d) });
    } catch (error) {
        console.error("Profile error:", error.message);
        return fail(res, 500, "Could not save the profile.");
    }
});

// ---------- POST /api/doctor/credential  (raw file: degree / registration certificate) ----------
// The admin looks at this file before approving the doctor. A new upload replaces the old one.
router.post("/credential", express.raw({ type: ["application/pdf", "image/png", "image/jpeg", "application/octet-stream"], limit: "2mb" }), async(req, res) => {
    try {
        const file = readUpload(req);
        if (file.error) return fail(res, 400, file.error);

        await Attachment.deleteOne({ kind: "credential", doctor: req.doctor._id });
        const saved = await Attachment.create({
            kind: "credential",
            uploadedBy: req.userId,
            doctor: req.doctor._id,
            name: file.name,
            mime: file.mime,
            size: file.buf.length,
            data: file.buf,
        });
        return res.status(201).json({
            success: true,
            message: "Document uploaded. The admin will check it.",
            data: { name: saved.name, size: saved.size, createdAt: saved.createdAt },
        });
    } catch (error) {
        console.error("Credential upload error:", error.message);
        return fail(res, 500, "Could not upload the document.");
    }
});

// ---------- PATCH /api/doctor/schedule ----------
// { workingDays:[1,2,3], startTime:"09:00", endTime:"18:00", slotMinutes:20, breakStart:"13:00", breakEnd:"14:00", reservedTimes:["10:00"] }
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

// ---------- walk-in / emergency visits ----------
// Returns a problem message if the doctor can't add a walk-in on this date, else null.
function walkInDateProblem(date) {
    if (!isValidDate(date)) return "Please choose a valid date.";
    const today = todayIST();
    if (date < today) return "You can't add a visit on a past date.";
    if (date > addDays(today, MAX_DAYS_AHEAD)) return `Choose a date within ${MAX_DAYS_AHEAD} days.`;
    return null;
}

// GET /api/doctor/walkin-slots?date=YYYY-MM-DD
// Every free slot of that day (including the ones reserved for walk-ins) that has not ended yet.
router.get("/walkin-slots", async(req, res) => {
    try {
        const { date } = req.query;
        const problem = walkInDateProblem(date);
        if (problem) return fail(res, 400, problem);

        if (!worksOn(req.doctor, date)) return res.json({ success: true, data: { date, closed: true, slots: [] } });

        const booked = await Appointment.find({ doctor: req.doctor._id, date, active: true }).select("time");
        const taken = new Set(booked.map((a) => a.time));
        const schedule = scheduleOf(req.doctor);
        const reserved = new Set(schedule.reservedTimes);

        const slots = allTimes(req.doctor)
            .filter((t) => !taken.has(t) && startAtFor(date, t).getTime() + schedule.slotMinutes * 60000 > Date.now())
            .map((t) => ({ time: t, reserved: reserved.has(t) }));

        return res.json({ success: true, data: { date, closed: false, slots } });
    } catch (error) {
        console.error("Walk-in slots error:", error.message);
        return fail(res, 500, "Could not load the slots.");
    }
});

// POST /api/doctor/walkin  { date, time, name, phone?, reason? }
router.post("/walkin", async(req, res) => {
    try {
        const { date, time, name, phone, reason } = req.body;

        const problem = walkInDateProblem(date);
        if (problem) return fail(res, 400, problem);
        if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) {
            return fail(res, 400, "Please enter the patient's name (2–80 characters).");
        }
        if (phone !== undefined && (typeof phone !== "string" || phone.length > 20)) return fail(res, 400, "Phone number is too long.");
        if (reason !== undefined && (typeof reason !== "string" || reason.length > 300)) return fail(res, 400, "Reason must be under 300 characters.");

        if (!worksOn(req.doctor, date)) return fail(res, 400, "You don't work on that day.");
        if (typeof time !== "string" || !allTimes(req.doctor).includes(time)) return fail(res, 400, "Please choose a valid time slot.");

        const startAt = startAtFor(date, time);
        if (startAt.getTime() + scheduleOf(req.doctor).slotMinutes * 60000 <= Date.now()) {
            return fail(res, 400, "That slot has already ended.");
        }

        let appointment;
        try {
            appointment = await Appointment.create({
                doctor: req.doctor._id,
                walkIn: true,
                walkInName: name.trim(),
                walkInPhone: (phone || "").trim(),
                date,
                time,
                startAt,
                reason: (reason || "").trim(),
                fee: req.doctor.consultationFee,
            });
        } catch (error) {
            if (error.code === 11000) return fail(res, 409, "That slot is already taken.");
            throw error;
        }

        return res.status(201).json({ success: true, message: "Walk-in visit added.", data: shape(appointment) });
    } catch (error) {
        console.error("Walk-in error:", error.message);
        return fail(res, 500, "Could not add the walk-in visit.");
    }
});

module.exports = router;