const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const requireAuth = require("../middleware/auth");
const notify = require("../utils/notify");

const router = express.Router();

// Razorpay is OPTIONAL. Without RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in .env,
// payments are simply switched off and the app keeps working ("pay at clinic").
const keyId = () => process.env.RAZORPAY_KEY_ID;
const keySecret = () => process.env.RAZORPAY_KEY_SECRET;
const enabled = () => Boolean(keyId() && keySecret());

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// GET /api/payments/config  -> tells the frontend whether to show "Pay now"
router.get("/config", (req, res) => {
    res.json({ success: true, data: { enabled: enabled(), keyId: enabled() ? keyId() : null } });
});

router.use(requireAuth);

// POST /api/payments/order  { appointmentId }
// Creates a Razorpay order for the appointment fee. The AMOUNT always comes from our database.
router.post("/order", async(req, res) => {
    try {
        if (!enabled()) return fail(res, 503, "Online payment is not set up. Please pay at the clinic.");

        const { appointmentId } = req.body;
        if (!mongoose.isValidObjectId(appointmentId)) return fail(res, 404, "Appointment not found.");

        const appointment = await Appointment.findOne({ _id: appointmentId, patient: req.userId });
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.status !== "booked") return fail(res, 409, "Only upcoming appointments can be paid.");
        if (appointment.paymentStatus !== "unpaid") return fail(res, 409, "This appointment is already paid.");
        if (!(appointment.fee > 0)) return fail(res, 400, "This appointment has no fee to pay.");

        const response = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Basic " + Buffer.from(`${keyId()}:${keySecret()}`).toString("base64"),
            },
            body: JSON.stringify({
                amount: Math.round(appointment.fee * 100), // paise
                currency: "INR",
                receipt: String(appointment._id).slice(-20),
            }),
        });
        const order = await response.json().catch(() => ({}));

        if (!response.ok || !order.id) {
            console.error("Razorpay order error:", JSON.stringify(order).slice(0, 300));
            return fail(res, 502, "Could not start the payment. Please try again.");
        }

        appointment.razorpayOrderId = order.id;
        await appointment.save();

        return res.json({
            success: true,
            data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: keyId() },
        });
    } catch (error) {
        console.error("Payment order error:", error.message);
        return fail(res, 500, "Could not start the payment.");
    }
});

// POST /api/payments/verify  { appointmentId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// The browser says "I paid". We do NOT trust that: we recompute Razorpay's signature with our secret.
router.post("/verify", async(req, res) => {
    try {
        if (!enabled()) return fail(res, 503, "Online payment is not set up.");

        const { appointmentId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        if (!mongoose.isValidObjectId(appointmentId) || [razorpay_order_id, razorpay_payment_id, razorpay_signature].some((v) => typeof v !== "string" || !v)) {
            return fail(res, 400, "Invalid payment details.");
        }

        const appointment = await Appointment.findOne({ _id: appointmentId, patient: req.userId });
        if (!appointment) return fail(res, 404, "Appointment not found.");
        if (appointment.paymentStatus === "paid") return res.json({ success: true, message: "Already paid." });
        if (!appointment.razorpayOrderId || appointment.razorpayOrderId !== razorpay_order_id) {
            return fail(res, 400, "This payment does not belong to this appointment.");
        }

        const expected = crypto
            .createHmac("sha256", keySecret())
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        const a = Buffer.from(expected);
        const b = Buffer.from(razorpay_signature);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return fail(res, 400, "Payment could not be verified.");
        }

        appointment.paymentStatus = "paid";
        appointment.paymentId = razorpay_payment_id;
        appointment.paidAt = new Date();
        await appointment.save();

        const [patient, doctor] = await Promise.all([
            User.findById(req.userId).select("name email"),
            Doctor.findById(appointment.doctor),
        ]);
        if (patient && doctor) notify.paymentReceipt(appointment, patient, doctor);

        return res.json({ success: true, message: "Payment successful." });
    } catch (error) {
        console.error("Payment verify error:", error.message);
        return fail(res, 500, "Could not verify the payment.");
    }
});

module.exports = router;