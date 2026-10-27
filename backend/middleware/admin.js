// Use AFTER requireAuth. Only admin accounts get through.
module.exports = function requireAdmin(req, res, next) {
    if (req.userRole !== "admin") {
        return res.status(403).json({ success: false, message: "Admins only." });
    }
    next();
};