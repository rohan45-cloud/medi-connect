const mongoose = require("mongoose");

// An uploaded file kept inside MongoDB (small PDFs / photos only, max 2 MB each).
//   kind "report"     : a patient's report attached to an appointment
//   kind "credential" : a doctor's degree / registration certificate (checked by the admin)
const attachmentSchema = new mongoose.Schema({
    kind: { type: String, enum: ["report", "credential"], required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", index: true },
    name: { type: String, required: true, maxlength: 120 },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    // the file itself: never loaded unless asked for with .select("+data")
    data: { type: Buffer, required: true, select: false },
}, { timestamps: true });

module.exports = mongoose.model("Attachment", attachmentSchema);