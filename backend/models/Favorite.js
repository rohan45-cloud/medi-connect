const mongoose = require("mongoose");

// A patient's saved ("favourite") doctor. One row per patient + doctor.
const favoriteSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
}, { timestamps: true });

favoriteSchema.index({ user: 1, doctor: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);