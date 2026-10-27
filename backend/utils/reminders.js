const Appointment = require("../models/Appointment");
const notify = require("./notify");

// Emails every patient whose appointment starts within the next 24 hours (once).
async function runReminders() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 3600000);

    const due = await Appointment.find({
            status: "booked",
            active: true,
            reminderSent: false,
            startAt: { $gte: now, $lte: in24h },
        })
        .populate("patient", "name email")
        .populate("doctor", "name");

    for (const a of due) {
        if (a.patient && a.doctor) notify.reminder(a, a.patient, a.doctor);
        a.reminderSent = true;
        await a.save();
    }
    return due.length;
}

// checks every 15 minutes
function startReminderJob() {
    const timer = setInterval(() => {
        runReminders().catch((e) => console.error("Reminder job error:", e.message));
    }, 15 * 60 * 1000);
    timer.unref();
}

module.exports = { runReminders, startReminderJob };