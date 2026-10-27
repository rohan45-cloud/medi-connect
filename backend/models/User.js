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
    // by the seed script and linked to a Doctor record.
    role: {
        type: String,
        enum: ["patient", "doctor", "admin"],
        default: "patient",
    },
    // password reset (only a HASH of the token is stored)
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);