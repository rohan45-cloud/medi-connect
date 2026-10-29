const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Favorite = require("../models/Favorite");
const requireAuth = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");
const { normalizePhone, sendSms } = require("../utils/sms");
const { OTP_MINUTES, MAX_TRIES, newCode, hashCode, sameHash } = require("../utils/otp");

const router = express.Router();
const fail = (res, status, message) => res.status(status).json({ success: false, message });

const codeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, message: "Too many codes requested. Please try again in an hour." });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: "Too many attempts. Please try again in 15 minutes." });

const profileOf = (user) => ({
    name: user.name,
    email: user.email,
    role: user.role || "patient",
    phone: user.phone || "",
    phoneVerified: Boolean(user.phone) && Boolean(user.phoneVerified),
    smsReminders: Boolean(user.smsReminders),
});

// everything here is about the logged-in person only
router.use(requireAuth);

// ---------- GET /api/me/profile ----------
router.get("/profile", async(req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return fail(res, 404, "Account not found.");
        return res.json({
            success: true,
            data: profileOf(user),
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
            const before = user.phone;
            if (typeof phone !== "string") return fail(res, 400, "Please enter a valid phone number.");
            if (phone.trim() === "") {
                user.phone = "";
            } else {
                const normal = normalizePhone(phone);
                if (!normal) return fail(res, 400, "Please enter a valid phone number, e.g. 9876543210.");
                user.phone = normal;
            }
            // a changed (or removed) number has to be verified again
            if (user.phone !== (before || "")) {
                user.phoneVerified = false;
                user.phoneOtpHash = undefined;
                user.phoneOtpExpires = undefined;
                user.phoneOtpTries = 0;
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
            data: profileOf(user),
        });
    } catch (error) {
        console.error("Profile save error:", error.message);
        return fail(res, 500, "Could not save your profile.");
    }
});

// ---------- phone verification ----------
// POST /api/me/phone/send-code -> sends a 6-digit code (SMS / WhatsApp) to the SAVED phone number
router.post("/phone/send-code", codeLimiter, async(req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return fail(res, 404, "Account not found.");
        if (!user.phone) return fail(res, 400, "Save your phone number first.");
        if (user.phoneVerified) return fail(res, 409, "This number is already verified.");

        const taken = await User.findOne({ phone: user.phone, phoneVerified: true, _id: { $ne: user._id } });
        if (taken) return fail(res, 409, "This number is already verified on another account.");

        const code = newCode();
        user.phoneOtpHash = hashCode(code, "phone", user._id);
        user.phoneOtpExpires = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
        user.phoneOtpTries = 0;
        await user.save();

        const sent = await sendSms(user.phone, `MediConnect verification code: ${code}. Valid for ${OTP_MINUTES} minutes. Do not share it.`);
        if (!sent) return fail(res, 502, "Could not send the code. Please check the number and try again.");

        return res.json({ success: true, message: `Code sent. It works for ${OTP_MINUTES} minutes.` });
    } catch (error) {
        console.error("Send code error:", error.message);
        return fail(res, 500, "Could not send the code.");
    }
});

// POST /api/me/phone/verify  { code }
router.post("/phone/verify", verifyLimiter, async(req, res) => {
    try {
        const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
        if (!/^\d{6}$/.test(code)) return fail(res, 400, "Please enter the 6-digit code.");

        const user = await User.findById(req.userId).select("+phoneOtpHash +phoneOtpExpires +phoneOtpTries");
        if (!user) return fail(res, 404, "Account not found.");
        if (user.phoneVerified) return res.json({ success: true, message: "Phone verified.", data: profileOf(user) });

        if (!user.phone || !user.phoneOtpHash || !user.phoneOtpExpires || user.phoneOtpExpires.getTime() <= Date.now()) {
            return fail(res, 400, "That code is invalid or has expired. Please ask for a new one.");
        }
        if ((user.phoneOtpTries || 0) >= MAX_TRIES) return fail(res, 400, "Too many wrong tries. Please ask for a new code.");

        if (!sameHash(hashCode(code, "phone", user._id), user.phoneOtpHash)) {
            user.phoneOtpTries = (user.phoneOtpTries || 0) + 1;
            await user.save();
            return fail(res, 400, "That code is invalid or has expired. Please ask for a new one.");
        }

        user.phoneVerified = true;
        user.phoneOtpHash = undefined;
        user.phoneOtpExpires = undefined;
        user.phoneOtpTries = 0;
        try {
            await user.save();
        } catch (error) {
            if (error.code === 11000) return fail(res, 409, "This number is already verified on another account.");
            throw error;
        }
        return res.json({ success: true, message: "Phone verified.", data: profileOf(user) });
    } catch (error) {
        console.error("Verify phone error:", error.message);
        return fail(res, 500, "Could not verify the phone number.");
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