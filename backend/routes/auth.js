const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const rateLimit = require("../middleware/rateLimit");
const notify = require("../utils/notify");

const router = express.Router();

// brute-force protection (per IP)
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: "Too many login attempts. Please try again in 15 minutes." });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: "Too many sign-ups from this network. Please try again later." });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: "Too many reset requests. Please try again in an hour." });

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function createToken(user) {
    return jwt.sign({ userId: user._id.toString() },
        process.env.JWT_SECRET, { expiresIn: "1d" }
    );
}

// Register
router.post("/register", registerLimiter, async(req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required.",
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (cleanName.length < 2 || cleanName.length > 80) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 80 characters.",
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address.",
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Password must be 8–72 characters long.",
            });
        }

        const existingUser = await User.findOne({ email: cleanEmail });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            name: cleanName,
            email: cleanEmail,
            password: hashedPassword,
        });

        const token = createToken(user);

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        console.error("Register error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Registration failed. Please try again.",
        });
    }
});

// Register as a DOCTOR (an application): creates the login + a doctor profile that stays HIDDEN
// from patients until an admin approves it in the Admin panel.
router.post("/register-doctor", registerLimiter, async(req, res) => {
    let createdUser = null;
    try {
        const { name, email, password, specialty, city, experience, consultationFee } = req.body;

        if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || typeof specialty !== "string") {
            return res.status(400).json({ success: false, message: "Name, email, password and specialty are required." });
        }
        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanSpecialty = specialty.trim();

        if (cleanName.length < 2 || cleanName.length > 80) {
            return res.status(400).json({ success: false, message: "Name must be between 2 and 80 characters." });
        }
        if (!cleanSpecialty || cleanSpecialty.length > 60) {
            return res.status(400).json({ success: false, message: "Please enter your specialty (under 60 characters)." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }
        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({ success: false, message: "Password must be 8–72 characters long." });
        }

        const fee = consultationFee === undefined || consultationFee === "" ? 500 : Number(consultationFee);
        const exp = experience === undefined || experience === "" ? 1 : Number(experience);
        if (!Number.isFinite(fee) || fee < 0 || fee > 100000) {
            return res.status(400).json({ success: false, message: "Fee must be between 0 and 100000." });
        }
        if (!Number.isFinite(exp) || exp < 0 || exp > 70) {
            return res.status(400).json({ success: false, message: "Experience must be between 0 and 70 years." });
        }
        if (city !== undefined && (typeof city !== "string" || city.length > 60)) {
            return res.status(400).json({ success: false, message: "City must be under 60 characters." });
        }

        if (await User.findOne({ email: cleanEmail })) {
            return res.status(409).json({ success: false, message: "An account with this email already exists." });
        }

        createdUser = await User.create({
            name: cleanName,
            email: cleanEmail,
            password: await bcrypt.hash(password, 12),
            role: "doctor",
        });

        await Doctor.create({
            name: cleanName,
            specialty: cleanSpecialty,
            city: (city || "").trim(),
            experience: Math.round(exp),
            consultationFee: Math.round(fee),
            approved: false, // hidden until an admin approves
            user: createdUser._id,
        });

        return res.status(201).json({
            success: true,
            message: "Application received. An admin will review it before patients can see you.",
            token: createToken(createdUser),
            user: { id: createdUser._id, name: createdUser.name, email: createdUser.email, role: createdUser.role },
        });
    } catch (error) {
        if (createdUser) await User.deleteOne({ _id: createdUser._id }).catch(() => {});
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "An account with this email already exists." });
        }
        console.error("Doctor register error:", error.message);
        return res.status(500).json({ success: false, message: "Could not submit the application. Please try again." });
    }
});

// Login
router.post("/login", loginLimiter, async(req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        const user = await User.findOne({ email: cleanEmail })
            .select("+password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const token = createToken(user);

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Login failed. Please try again.",
        });
    }
});

// Forgot password: ALWAYS answers the same, so nobody can find out which emails exist.
router.post("/forgot-password", forgotLimiter, async(req, res) => {
    const generic = {
        success: true,
        message: "If an account exists for that email, a reset link has been sent.",
    };

    try {
        const { email } = req.body;
        if (typeof email !== "string" || !email.trim()) {
            return res.status(400).json({ success: false, message: "Please enter your email." });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.json(generic);

        const token = crypto.randomBytes(32).toString("hex");
        user.resetTokenHash = sha256(token);
        user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();

        const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");
        notify.passwordReset(user, `${clientUrl}/?reset=${token}`);

        return res.json(generic);
    } catch (error) {
        console.error("Forgot password error:", error.message);
        return res.status(500).json({ success: false, message: "Could not start the reset. Please try again." });
    }
});

// Reset password: { token, password }
router.post("/reset-password", forgotLimiter, async(req, res) => {
    try {
        const { token, password } = req.body;

        if (typeof token !== "string" || !token || typeof password !== "string") {
            return res.status(400).json({ success: false, message: "Reset link and new password are required." });
        }
        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({ success: false, message: "Password must be 8–72 characters long." });
        }

        const user = await User.findOne({
                resetTokenHash: sha256(token),
                resetTokenExpires: { $gt: new Date() },
            })
            .select("+resetTokenHash +resetTokenExpires");

        if (!user) {
            return res.status(400).json({ success: false, message: "This reset link is invalid or has expired." });
        }

        user.password = await bcrypt.hash(password, 12);
        user.resetTokenHash = undefined;
        user.resetTokenExpires = undefined;
        await user.save();

        return res.json({ success: true, message: "Password changed. You can log in now." });
    } catch (error) {
        console.error("Reset password error:", error.message);
        return res.status(500).json({ success: false, message: "Could not reset the password. Please try again." });
    }
});

module.exports = router;