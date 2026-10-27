const Doctor = require("../models/Doctor");

// Use AFTER requireAuth. Only doctor accounts get through.
// Sets req.doctor = the Doctor record linked to the logged-in user.
module.exports = async function requireDoctor(req, res, next) {
    if (req.userRole !== "doctor") {
        return res.status(403).json({
            success: false,
            message: "This area is only for doctor accounts.",
        });
    }

    try {
        const doctor = await Doctor.findOne({ user: req.userId });

        if (!doctor) {
            return res.status(403).json({
                success: false,
                message: "No doctor profile is linked to this account.",
            });
        }

        req.doctor = doctor;
        next();
    } catch (error) {
        console.error("Doctor check error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Could not verify the doctor account.",
        });
    }
};