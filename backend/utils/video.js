const crypto = require("crypto");

// Video visits use a free Jitsi Meet room. No account or API key is needed.
// The room name is a keyed hash of the appointment id, so nobody can guess it,
// and it is only ever handed out to the patient and the doctor of that appointment.
//
// .env (optional): VIDEO_BASE_URL=https://meet.jit.si   (change it if you host your own Jitsi)

const OPENS_BEFORE_MIN = 10; // the call can be joined 10 minutes before the visit
const CLOSES_AFTER_MIN = 30; // ...and up to 30 minutes after the slot ends

const baseUrl = () => (process.env.VIDEO_BASE_URL || "https://meet.jit.si").replace(/\/+$/, "");

function roomName(appointmentId) {
    const secret = process.env.JWT_SECRET || "dev-secret";
    const hash = crypto.createHmac("sha256", secret).update(`video:${appointmentId}`).digest("hex");
    return `MediConnect-${hash.slice(0, 20)}`;
}

// { opensAt, closesAt } as Dates
function windowFor(appointment, slotMinutes) {
    const start = new Date(appointment.startAt).getTime();
    return {
        opensAt: new Date(start - OPENS_BEFORE_MIN * 60000),
        closesAt: new Date(start + ((slotMinutes || 30) + CLOSES_AFTER_MIN) * 60000),
    };
}

function roomUrl(appointmentId, displayName) {
    const name = encodeURIComponent(JSON.stringify(String(displayName || "Guest").slice(0, 60)));
    return `${baseUrl()}/${roomName(appointmentId)}#userInfo.displayName=${name}`;
}

module.exports = { roomName, roomUrl, windowFor, OPENS_BEFORE_MIN, CLOSES_AFTER_MIN };