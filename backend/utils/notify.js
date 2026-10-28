const { sendMail } = require("./mailer");
const { sendSms } = require("./sms");

function when(a) {
    return `${a.date} at ${a.time} (IST)`;
}

// All of these are "fire and forget": call them without await.
const fire = (promise) => promise.catch((e) => console.error("Notify error:", e.message));

exports.bookingConfirmed = (a, patient, doctor) =>
    fire(sendMail({
        to: patient.email,
        subject: `Appointment confirmed with ${doctor.name}`,
        text: `Hi ${patient.name},\n\nYour appointment with ${doctor.name} is confirmed for ${when(a)}.\nFee: Rs ${a.fee}\n\nYou can reschedule or cancel up to 2 hours before the visit from "My appointments".\n\n- MediConnect`,
    }));

exports.rescheduled = (a, patient, doctor) =>
    fire(sendMail({
        to: patient.email,
        subject: `Appointment moved to ${a.date} ${a.time}`,
        text: `Hi ${patient.name},\n\nYour appointment with ${doctor.name} is now on ${when(a)}.\n\n- MediConnect`,
    }));

exports.cancelled = (a, patient, doctor, by) =>
    fire(sendMail({
        to: patient.email,
        subject: `Appointment cancelled (${doctor.name}, ${a.date})`,
        text: `Hi ${patient.name},\n\nYour appointment with ${doctor.name} on ${when(a)} was cancelled${by === "doctor" ? " by the doctor" : ""}.${a.paymentStatus === "refund-pending" ? "\nYou paid online, so a refund will be processed by the clinic." : ""}\n\n- MediConnect`,
    }));

// Email always; SMS / WhatsApp too when the patient turned it on and saved a phone number.
exports.reminder = (a, patient, doctor) => {
    fire(sendMail({
        to: patient.email,
        subject: `Reminder: appointment with ${doctor.name} on ${a.date}`,
        text: `Hi ${patient.name},\n\nThis is a reminder of your appointment with ${doctor.name} on ${when(a)}.\n\n- MediConnect`,
    }));
    if (patient.smsReminders && patient.phone) {
        fire(sendSms(patient.phone, `MediConnect reminder: appointment with ${doctor.name} on ${when(a)}.`));
    }
};

exports.followUp = (a, patient, doctor) =>
    fire(sendMail({
        to: patient.email,
        subject: `${doctor.name} suggests a follow-up visit on ${a.followUpDate}`,
        text: `Hi ${patient.name},\n\nAfter your visit on ${when(a)}, ${doctor.name} suggests a follow-up around ${a.followUpDate}.\nYou can book it from "My appointments" -> "Book again".\n\n- MediConnect`,
    }));

exports.refunded = (a, patient, doctor) =>
    fire(sendMail({
        to: patient.email,
        subject: `Refund processed: Rs ${a.fee}`,
        text: `Hi ${patient.name},\n\nYour refund of Rs ${a.fee} for the cancelled appointment with ${doctor.name} (${when(a)}) has been processed. It can take a few days to show in your account.\n\n- MediConnect`,
    }));

exports.paymentReceipt = (a, patient, doctor) =>
    fire(sendMail({
        to: patient.email,
        subject: `Payment received: Rs ${a.fee}`,
        text: `Hi ${patient.name},\n\nWe received Rs ${a.fee} for your appointment with ${doctor.name} on ${when(a)}.\nPayment id: ${a.paymentId}\n\n- MediConnect`,
    }));

exports.passwordReset = (user, link) =>
    fire(sendMail({
        to: user.email,
        subject: "Reset your MediConnect password",
        text: `Hi ${user.name},\n\nOpen this link to choose a new password (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.\n\n- MediConnect`,
    }));