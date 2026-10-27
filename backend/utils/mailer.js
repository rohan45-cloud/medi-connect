// Sends emails. Works in 3 modes, so the project runs everywhere:
//  1. SMTP_HOST (+ SMTP_USER, SMTP_PASS) set and "nodemailer" installed -> real email
//  2. otherwise -> the email is printed in the backend terminal (great for development)
// sendMail NEVER throws: a failed email must never break booking.

let transporter = null;
let triedToLoad = false;

function getTransporter() {
    if (triedToLoad) return transporter;
    triedToLoad = true;

    if (!process.env.SMTP_HOST) return null;

    try {
        const nodemailer = require("nodemailer");
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        });
    } catch (error) {
        console.warn("SMTP_HOST is set but 'nodemailer' is not installed. Run: npm install nodemailer");
        transporter = null;
    }
    return transporter;
}

async function sendMail({ to, subject, text }) {
    if (!to) return false;

    const mailer = getTransporter();
    if (!mailer) {
        console.log(`\n[email -> ${to}]\nSubject: ${subject}\n${text}\n`);
        return true;
    }

    try {
        await mailer.sendMail({
            from: process.env.MAIL_FROM || `MediConnect <${process.env.SMTP_USER || "no-reply@mediconnect.local"}>`,
            to,
            subject,
            text,
        });
        return true;
    } catch (error) {
        console.error("Email failed:", error.message);
        return false;
    }
}

module.exports = { sendMail };