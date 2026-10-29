const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true,
        minlength: 2,
        maxlength: 80,
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        select: false,
    },
    // Public registration always creates "patient". Doctor accounts are created
    // by the seed script / admin / doctor application and linked to a Doctor record.
    role: {
        type: String,
        enum: ["patient", "doctor", "admin"],
        default: "patient",
    },
    // optional phone for SMS / WhatsApp reminders
    phone: { type: String, trim: true, maxlength: 20, default: "" },
    smsReminders: { type: Boolean, default: false },
    // the phone number was confirmed with a code (only verified numbers can be used to log in / reset a password)
    phoneVerified: { type: Boolean, default: false },
    phoneOtpHash: { type: String, select: false },
    phoneOtpExpires: { type: Date, select: false },
    phoneOtpTries: { type: Number, default: 0, select: false },
    // password reset by SMS / WhatsApp code
    resetOtpHash: { type: String, select: false },
    resetOtpExpires: { type: Date, select: false },
    resetOtpTries: { type: Number, default: 0, select: false },
    // an admin can block an account (it can no longer log in or use the API)
    blocked: { type: Boolean, default: false },
    // password reset (only a HASH of the token is stored)
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
}, { timestamps: true });

// one VERIFIED account per phone number (unverified numbers can't block anybody)
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phoneVerified: true } });

module.exports = mongoose.model("User", userSchema);