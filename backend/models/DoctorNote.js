const mongoose = require("mongoose");

// A private note a doctor writes about a patient's visit. Patients never see these.
const noteSchema = new mongoose.Schema({
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
}, { timestamps: true });

module.exports = mongoose.model("DoctorNote", noteSchema);