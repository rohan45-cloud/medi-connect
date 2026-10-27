import { apiFetch } from "./api";

// Loads Razorpay's checkout script once, only when someone clicks "Pay now".
function loadCheckout() {
    return new Promise((resolve, reject) => {
        if (window.Razorpay) return resolve();
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load the payment window. Check your internet."));
        document.body.appendChild(script);
    });
}

// Is online payment switched on in the backend (.env has Razorpay keys)?
export async function paymentsEnabled() {
    try {
        const res = await apiFetch("/payments/config");
        return Boolean(res.data.enabled);
    } catch {
        return false;
    }
}

// Opens Razorpay for one appointment. Resolves when the payment is VERIFIED by our backend.
export async function payForAppointment(appointment, user) {
    const order = (
        await apiFetch("/payments/order", {
            method: "POST",
            body: { appointmentId: appointment._id },
        })
    ).data;

    await loadCheckout();

    return new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            order_id: order.orderId,
            name: "MediConnect",
            description: `Visit with ${appointment.doctor?.name || "doctor"}`,
            prefill: { name: user?.name, email: user?.email },
            theme: { color: "#167c75" },
            handler: async(response) => {
                try {
                    await apiFetch("/payments/verify", {
                        method: "POST",
                        body: {
                            appointmentId: appointment._id,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        },
                    });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            },
            modal: { ondismiss: () => reject(new Error("cancelled")) },
        });
        checkout.open();
    });
}