const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protects a route: the request must carry "Authorization: Bearer <token>".
// On success:
//   req.userId   = the logged-in user's id
//   req.userRole = "patient" or "doctor" (always read fresh from the database)
module.exports = async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Please log in to continue.",
        });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(payload.userId).select("role");
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Account not found. Please log in again.",
            });
        }

        req.userId = String(user._id);
        req.userRole = user.role || "patient"; // old accounts have no role: they are patients
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Your session expired. Please log in again.",
        });
    }
};