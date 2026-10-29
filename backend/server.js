const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");
const appointmentRoutes = require("./routes/appointments");
const doctorPortalRoutes = require("./routes/doctorPortal");
const doctorRoutes = require("./routes/doctors");
const paymentRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");
const meRoutes = require("./routes/me");
const reportRoutes = require("./routes/reports");
const videoRoutes = require("./routes/video");
const { startReminderJob } = require("./utils/reminders");


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Behind Render/Railway etc. the real visitor IP is in a header (needed for rate limiting)
app.set("trust proxy", 1);

// Only your own frontend may call the API from a browser.
// CLIENT_URL can be several addresses separated by commas. Not set = allow all (development).
const allowedOrigins = (process.env.CLIENT_URL || "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));

// a few safe browser headers
app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "no-referrer");
    next();
});
app.use(express.json({ limit: "20kb" }));


app.use("/api/auth", authRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/doctor", doctorPortalRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/me", meRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/video", videoRoutes);

// Any error that slips through (too-big upload, broken JSON...) is answered in JSON, never as an HTML page
app.use((err, req, res, next) => {
    if (err && err.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "That request or file is too large (files: maximum 2 MB)." });
    }
    if (err && err.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "The request could not be read." });
    }
    console.error("Unhandled error:", err && err.message);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
});

// MongoDB connection
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connected successfully!");
    })
    .catch((error) => {
        console.error("MongoDB connection error:", error.message);
    });

// Home route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Welcome to MediConnect API",
    });
});

// Health check route
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "MediConnect backend is running!",
        timestamp: new Date().toISOString(),
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`MediConnect API running at http://localhost:${PORT}`);
    if (process.env.ENABLE_REMINDERS !== "0") startReminderJob();
});