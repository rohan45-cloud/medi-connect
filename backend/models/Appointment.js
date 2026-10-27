const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true,
    },
    // Clinic time (India, IST). Stored as plain strings for easy display.
    date: { type: String, required: true }, // "2026-11-03"
    time: { type: String, required: true }, // "10:30"
    // The same moment as a real Date, used for sorting and "is it in the past?"
    startAt: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    fee: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ["booked", "completed", "no-show", "cancelled"],
        default: "booked",
    },
    // true only while the appointment occupies the slot
    active: { type: Boolean, default: true },
    cancelledAt: { type: Date },
    // who cancelled (empty = the patient, for older records)
    cancelledBy: { type: String, enum: ["patient", "doctor"] },
}, { timestamps: true });

// THE double-booking guard.
// Only ONE active appointment can exist for a doctor at a given moment.
// If two people click "book" at the same time, MongoDB lets one insert succeed
// and rejects the other with error code 11000.
// Cancelled appointments have active:false, so their slot becomes free again.
appointmentSchema.index({ doctor: 1, startAt: 1 }, { unique: true, partialFilterExpression: { active: true } });

module.exports = mongoose.model("Appointment", appointmentSchema);