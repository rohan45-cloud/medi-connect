const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Favorite = require("../models/Favorite");
const requireAuth = require("../middleware/auth");
const { normalizePhone } = require("../utils/sms");

const router = express.Router();
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// everything here is about the logged-in person only
router.use(requireAuth);

// ---------- GET /api/me/profile ----------
router.get("/profile", async(req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return fail(res, 404, "Account not found.");
        return res.json({
            success: true,
            data: { name: user.name, email: user.email, role: user.role || "patient", phone: user.phone || "", smsReminders: Boolean(user.smsReminders) },
        });
    } catch (error) {
        return fail(res, 500, "Could not load your profile.");
    }
});

// ---------- PATCH /api/me/profile  { name?, phone?, smsReminders? } ----------
router.patch("/profile", async(req, res) => {
    try {
        const { name, phone, smsReminders } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return fail(res, 404, "Account not found.");

        if (name !== undefined) {
            if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) {
                return fail(res, 400, "Name must be between 2 and 80 characters.");
            }
            user.name = name.trim();
        }

        if (phone !== undefined) {
            if (typeof phone !== "string") return fail(res, 400, "Please enter a valid phone number.");
            if (phone.trim() === "") {
                user.phone = "";
            } else {
                const normal = normalizePhone(phone);
                if (!normal) return fail(res, 400, "Please enter a valid phone number, e.g. 9876543210.");
                user.phone = normal;
            }
        }

        if (smsReminders !== undefined) {
            if (typeof smsReminders !== "boolean") return fail(res, 400, "smsReminders must be true or false.");
            user.smsReminders = smsReminders;
        }

        if (user.smsReminders && !user.phone) {
            return fail(res, 400, "Add your phone number to get SMS / WhatsApp reminders.");
        }

        await user.save();
        return res.json({
            success: true,
            message: "Profile saved.",
            data: { name: user.name, email: user.email, role: user.role || "patient", phone: user.phone || "", smsReminders: Boolean(user.smsReminders) },
        });
    } catch (error) {
        console.error("Profile save error:", error.message);
        return fail(res, 500, "Could not save your profile.");
    }
});

// ---------- favourites (patients) ----------
// GET /api/me/favorites -> list of doctor ids
router.get("/favorites", async(req, res) => {
    try {
        const rows = await Favorite.find({ user: req.userId });
        return res.json({ success: true, data: rows.map((r) => String(r.doctor)) });
    } catch (error) {
        return fail(res, 500, "Could not load your favourites.");
    }
});

// PUT /api/me/favorites/:doctorId
router.put("/favorites/:doctorId", async(req, res) => {
    try {
        if (req.userRole !== "patient") return fail(res, 403, "Only patient accounts can save favourites.");
        if (!mongoose.isValidObjectId(req.params.doctorId)) return fail(res, 404, "Doctor not found.");

        const doctor = await Doctor.findById(req.params.doctorId);
        if (!doctor || doctor.approved === false) return fail(res, 404, "Doctor not found.");

        if (!(await Favorite.findOne({ user: req.userId, doctor: doctor._id }))) {
            try {
                await Favorite.create({ user: req.userId, doctor: doctor._id });
            } catch (error) {
                if (error.code !== 11000) throw error; // saved twice at the same moment: fine
            }
        }
        return res.json({ success: true, message: "Saved to favourites." });
    } catch (error) {
        console.error("Favourite error:", error.message);
        return fail(res, 500, "Could not save the favourite.");
    }
});

// DELETE /api/me/favorites/:doctorId
router.delete("/favorites/:doctorId", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.doctorId)) return fail(res, 404, "Doctor not found.");
        await Favorite.deleteOne({ user: req.userId, doctor: req.params.doctorId });
        return res.json({ success: true, message: "Removed from favourites." });
    } catch (error) {
        return fail(res, 500, "Could not remove the favourite.");
    }
});

module.exports = router;