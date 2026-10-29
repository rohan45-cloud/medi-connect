const crypto = require("crypto");

// One-time codes (6 digits) for verifying a phone number and for resetting a password by SMS / WhatsApp.
// Only a keyed HASH of the code is stored, never the code itself.

const OTP_MINUTES = 10; // a code works for 10 minutes
const MAX_TRIES = 5; // after 5 wrong guesses the code is dead

const secret = () => process.env.JWT_SECRET || "dev-secret";

const newCode = () => String(crypto.randomInt(100000, 1000000));

// purpose: "phone" | "reset"  (so a phone code can never be used as a reset code)
const hashCode = (code, purpose, userId) =>
    crypto.createHmac("sha256", secret()).update(`${purpose}:${userId}:${code}`).digest("hex");

function sameHash(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { OTP_MINUTES, MAX_TRIES, newCode, hashCode, sameHash };