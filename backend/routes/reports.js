const express = require("express");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Attachment = require("../models/Attachment");
const Doctor = require("../models/Doctor");
const requireAuth = require("../middleware/auth");
const { readUpload } = require("../utils/files");

const router = express.Router();
const fail = (res, status, message) => res.status(status).json({ success: false, message });

const MAX_REPORTS_PER_APPOINTMENT = 3;

// the file is sent as the raw request body (Content-Type: application/pdf | image/png | image/jpeg)
const rawFile = express.raw({
    type: ["application/pdf", "image/png", "image/jpeg", "application/octet-stream"],
    limit: "2mb",
});

router.use(requireAuth);

const meta = (a) => ({ _id: a._id, name: a.name, mime: a.mime, size: a.size, createdAt: a.createdAt });

// Who may see the reports of an appointment? The patient who owns it and the doctor it is with.
async function canSee(req, appointment) {
    if (req.userRole === "patient" && String(appointment.patient) === req.userId) return true;
    if (req.userRole === "doctor") {
        const doctor = await Doctor.findOne({ user: req.userId });
        return Boolean(doctor) && String(appointment.doctor) === String(doctor._id);
    }
    return false;
}

// ---------- POST /api/reports/:appointmentId  (raw file body, header X-File-Name) ----------
router.post("/:appointmentId", rawFile, async(req, res) => {
    try {
        if (req.userRole !== "patient") return fail(res, 403, "Only the patient can attach reports.");
        if (!mongoose.isValidObjectId(req.params.appointmentId)) return fail(res, 404, "Appointment not found.");

        const appointment = await Appointment.findOne({ _id: req.params.appointmentId, patient: req.userId });
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.status !== "booked") return fail(res, 409, "Reports can only be added to an upcoming appointment.");

        const count = await Attachment.countDocuments({ appointment: appointment._id, kind: "report" });
        if (count >= MAX_REPORTS_PER_APPOINTMENT) {
            return fail(res, 409, `You can attach up to ${MAX_REPORTS_PER_APPOINTMENT} files to one appointment.`);
        }

        const file = readUpload(req);
        if (file.error) return fail(res, 400, file.error);

        const saved = await Attachment.create({
            kind: "report",
            uploadedBy: req.userId,
            appointment: appointment._id,
            doctor: appointment.doctor,
            name: file.name,
            mime: file.mime,
            size: file.buf.length,
            data: file.buf,
        });
        return res.status(201).json({ success: true, message: "File attached.", data: meta(saved) });
    } catch (error) {
        console.error("Report upload error:", error.message);
        return fail(res, 500, "Could not upload the file.");
    }
});

// ---------- GET /api/reports/appointment/:appointmentId ----------
router.get("/appointment/:appointmentId", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.appointmentId)) return fail(res, 404, "Appointment not found.");
        const appointment = await Appointment.findById(req.params.appointmentId);
        if (!appointment || !(await canSee(req, appointment))) return fail(res, 404, "Appointment not found.");

        const files = await Attachment.find({ appointment: appointment._id, kind: "report" }).select("-data");
        return res.json({ success: true, count: files.length, data: files.map(meta) });
    } catch (error) {
        return fail(res, 500, "Could not load the files.");
    }
});

// ---------- GET /api/reports/file/:id  (download) ----------
router.get("/file/:id", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "File not found.");
        const file = await Attachment.findById(req.params.id).select("+data");
        if (!file || file.kind !== "report") return fail(res, 404, "File not found.");

        const appointment = await Appointment.findById(file.appointment);
        if (!appointment || !(await canSee(req, appointment))) return fail(res, 404, "File not found.");

        res.set({
            "Content-Type": file.mime,
            "Content-Disposition": `attachment; filename="${file.name}"`,
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, no-store",
        });
        return res.end(Buffer.from(file.data));
    } catch (error) {
        console.error("Report download error:", error.message);
        return fail(res, 500, "Could not download the file.");
    }
});

// ---------- DELETE /api/reports/file/:id  (the patient, while the visit is still upcoming) ----------
router.delete("/file/:id", async(req, res) => {
    try {
        if (req.userRole !== "patient") return fail(res, 403, "Only the patient can remove a file.");
        if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "File not found.");

        const file = await Attachment.findById(req.params.id).select("-data");
        if (!file || file.kind !== "report" || String(file.uploadedBy) !== req.userId) return fail(res, 404, "File not found.");

        const appointment = await Appointment.findById(file.appointment);
        if (!appointment || appointment.status !== "booked") return fail(res, 409, "Files can only be removed from an upcoming appointment.");

        await Attachment.deleteOne({ _id: file._id });
        return res.json({ success: true, message: "File removed." });
    } catch (error) {
        return fail(res, 500, "Could not remove the file.");
    }
});

module.exports = router;