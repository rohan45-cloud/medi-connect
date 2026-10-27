const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    experience: { type: Number, default: 1 },
    consultationFee: { type: Number, default: 500 },
    rating: { type: Number, default: 4.5 },
    available: { type: Boolean, default: true },
    image: { type: String, default: "" },
    city: { type: String, trim: true, maxlength: 60, default: "" },
    about: { type: String, trim: true, maxlength: 500, default: "" },
    reviewCount: { type: Number, default: 0 },
    approved: { type: Boolean, default: true },
    schedule: {
        workingDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
        startTime: { type: String, default: "10:00" },
        endTime: { type: String, default: "17:00" },
        slotMinutes: { type: Number, default: 30 },
        breakStart: { type: String, default: "13:00" },
        breakEnd: { type: String, default: "14:00" },
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        unique: true,
        sparse: true,
    },
}, { timestamps: true });

module.exports = mongoose.model("Doctor", doctorSchema);