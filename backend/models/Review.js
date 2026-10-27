const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
    // unique: one review per appointment
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Review", reviewSchema);