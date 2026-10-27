const express = require("express");
const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const Review = require("../models/Review");

const router = express.Router();

// Patients only see approved doctors (old records have no "approved" field = approved)
const visible = { approved: { $ne: false } };

// GET /api/doctors
router.get("/", async(req, res) => {
    try {
        const doctors = await Doctor.find(visible).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: doctors.length, data: doctors });
    } catch (error) {
        console.error("Fetch doctors error:", error.message);
        res.status(500).json({ success: false, message: "Failed to fetch doctors" });
    }
});

// GET /api/doctors/:id
router.get("/:id", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid doctor ID" });
        }
        const doctor = await Doctor.findById(req.params.id);
        if (!doctor || doctor.approved === false) {
            return res.status(404).json({ success: false, message: "Doctor not found" });
        }
        res.status(200).json({ success: true, data: doctor });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch doctor" });
    }
});

// GET /api/doctors/:id/reviews  (latest 20, patient first name only)
router.get("/:id/reviews", async(req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid doctor ID" });
        }
        const reviews = await Review.find({ doctor: req.params.id })
            .sort({ createdAt: -1 })
            .populate("patient", "name");

        const data = reviews.slice(0, 20).map((r) => ({
            _id: r._id,
            rating: r.rating,
            comment: r.comment,
            createdAt: r.createdAt,
            patientName: r.patient && r.patient.name ? r.patient.name.split(" ")[0] : "Patient",
        }));
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch reviews" });
    }
});

module.exports = router;