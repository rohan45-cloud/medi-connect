const fs = require("fs");
const path = require("path");

const need = [
    "server.js", "seed.js", ".env",
    "middleware/auth.js", "middleware/doctor.js", "middleware/admin.js", "middleware/rateLimit.js",
    "models/User.js", "models/Doctor.js", "models/Appointment.js", "models/Review.js",
    "routes/auth.js", "routes/appointments.js", "routes/doctorPortal.js", "routes/doctors.js", "routes/payments.js", "routes/admin.js",
    "utils/schedule.js", "utils/mailer.js", "utils/notify.js", "utils/reminders.js",
];

const missing = need.filter((f) => !fs.existsSync(path.join(__dirname, f)));

if (missing.length === 0) {
    console.log("OK: all files are here. Now run: npm start");
} else {
    console.log("MISSING FILES (copy these from the zip):");
    missing.forEach((f) => console.log("  - " + f));
}