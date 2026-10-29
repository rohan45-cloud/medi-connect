// Sends an SMS (or a WhatsApp message) with Twilio, if it is set up. Never throws.
//
// .env:
//   TWILIO_ACCOUNT_SID=ACxxxxxxxx
//   TWILIO_AUTH_TOKEN=xxxxxxxx
//   TWILIO_FROM=+1415xxxxxxx            (your Twilio number; for WhatsApp the sandbox number)
//   TWILIO_CHANNEL=whatsapp             (optional: send on WhatsApp instead of SMS)
//   TWILIO_CONTENT_SID=HXxxxxxxxx       (optional: a WhatsApp template with ONE variable {{1}}; use it when
//                                        Twilio says "ContentSid Required")
//
// Without those, the message is only printed in the backend terminal (development mode).

// "98765 43210" -> "+919876543210". Returns null when it can't be a phone number.
function normalizePhone(raw) {
    if (!raw) return null;
    let p = String(raw).replace(/[\s()-]/g, "");
    if (/^\d{10}$/.test(p)) p = "+91" + p; // India by default
    else if (/^0\d{10}$/.test(p)) p = "+91" + p.slice(1);
    else if (/^91\d{10}$/.test(p)) p = "+" + p;
    return /^\+\d{10,14}$/.test(p) ? p : null;
}

const configured = () =>
    Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

// Normal message: plain Body. With TWILIO_CONTENT_SID (WhatsApp only): the whole text goes into template variable {{1}}.
function params(wrap, phone, text, whatsapp) {
    const p = { To: wrap(phone), From: wrap(process.env.TWILIO_FROM) };
    if (whatsapp && process.env.TWILIO_CONTENT_SID) {
        p.ContentSid = process.env.TWILIO_CONTENT_SID;
        // WhatsApp template variables can't contain new lines
        p.ContentVariables = JSON.stringify({ 1: String(text).replace(/\s*\n+\s*/g, " ").trim() });
    } else {
        p.Body = text;
    }
    return new URLSearchParams(p);
}

async function sendSms(to, text) {
    const phone = normalizePhone(to);
    if (!phone) return false;

    if (!configured()) {
        console.log(`\n[sms -> ${phone}]\n${text}\n`);
        return true;
    }

    try {
        const whatsapp = process.env.TWILIO_CHANNEL === "whatsapp";
        const wrap = (n) => (whatsapp ? `whatsapp:${n}` : n);
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
            },
            body: params(wrap, phone, text, whatsapp).toString(),
        });
        if (!response.ok) {
            console.error("SMS failed:", response.status, (await response.text()).slice(0, 200));
            return false;
        }
        return true;
    } catch (error) {
        console.error("SMS failed:", error.message);
        return false;
    }
}

module.exports = { sendSms, normalizePhone };