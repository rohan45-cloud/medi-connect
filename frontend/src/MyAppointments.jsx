import { useCallback, useEffect, useState } from "react";
import { X, CalendarCheck, Star } from "lucide-react";
import { apiFetch } from "./api";
import { formatTime } from "./BookingModal";
import { paymentsEnabled, payForAppointment } from "./payments";

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusOf(appointment) {
  if (appointment.status === "completed") return ["completed", "Completed"];
  if (appointment.status === "no-show") return ["noshow", "Missed"];
  if (appointment.status === "cancelled") {
    return [
      "cancelled",
      appointment.cancelledBy === "doctor" ? "Cancelled by doctor" : "Cancelled",
    ];
  }
  if (new Date(appointment.startAt).getTime() < Date.now()) return ["past", "Past"];
  return ["upcoming", "Upcoming"];
}

function paymentLabel(a) {
  if (a.paymentStatus === "paid") return "Paid";
  if (a.paymentStatus === "refund-pending") return "Refund pending";
  return null;
}

export default function MyAppointments({
  user,
  onClose,
  onChanged,
  onAuthError,
  onReschedule,
}) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [payOn, setPayOn] = useState(false);
  const [reviewing, setReviewing] = useState(null); // appointment id
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await apiFetch("/appointments/me");
      setAppointments(result.data);
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    paymentsEnabled().then(setPayOn);
  }, [load]);

  async function run(id, task) {
    try {
      setBusyId(id);
      setError("");
      await task();
    } catch (err) {
      if (err.status === 401) return onAuthError();
      if (err.message !== "cancelled") setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  function handleCancel(a) {
    const ok = window.confirm(
      `Cancel your appointment with ${a.doctor?.name} on ${formatDate(a.date)} at ${formatTime(a.time)}?`
    );
    if (!ok) return;
    run(a._id, async () => {
      await apiFetch(`/appointments/${a._id}/cancel`, { method: "PATCH" });
      onChanged(
        a.paymentStatus === "paid"
          ? "Appointment cancelled. Your refund will be processed by the clinic."
          : "Appointment cancelled."
      );
      await load();
    });
  }

  function handlePay(a) {
    run(a._id, async () => {
      await payForAppointment(a, user);
      onChanged("Payment successful.");
      await load();
    });
  }

  function handleReview(a) {
    if (rating < 1) return setError("Please choose 1 to 5 stars.");
    run(a._id, async () => {
      await apiFetch(`/appointments/${a._id}/review`, {
        method: "POST",
        body: { rating, comment: comment.trim() },
      });
      onChanged("Thanks for your review!");
      setReviewing(null);
      setRating(0);
      setComment("");
      await load();
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="My appointments"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 className="appt-title">
          <CalendarCheck size={22} /> My appointments
        </h2>

        {error && (
          <p className="booking-error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="booking-hint">Loading...</p>
        ) : appointments.length === 0 ? (
          <p className="booking-hint">
            You have no appointments yet. Pick a doctor and tap "Book visit".
          </p>
        ) : (
          <ul className="appt-list">
            {appointments.map((a) => {
              const [kind, label] = statusOf(a);
              const pay = paymentLabel(a);
              const busy = busyId === a._id;
              return (
                <li key={a._id} className="appt-item appt-item-col">
                  <div className="appt-row">
                    <div>
                      <strong>{a.doctor?.name || "Doctor"}</strong>
                      <span className="appt-sub">{a.doctor?.specialty}</span>
                      <span className="appt-when">
                        {formatDate(a.date)} · {formatTime(a.time)}
                      </span>
                      {a.reason && <span className="appt-sub">“{a.reason}”</span>}
                    </div>

                    <div className="appt-side">
                      <span className={`appt-badge appt-${kind}`}>{label}</span>
                      {pay && (
                        <span className={`appt-badge ${a.paymentStatus === "paid" ? "appt-completed" : "appt-noshow"}`}>
                          {pay}
                        </span>
                      )}
                      <div className="dash-actions">
                        {payOn && a.canPay && (
                          <button
                            type="button"
                            className="button button-primary appt-cancel dash-done"
                            disabled={busy}
                            onClick={() => handlePay(a)}
                          >
                            Pay ₹{a.fee}
                          </button>
                        )}
                        {a.canReschedule && (
                          <button
                            type="button"
                            className="button button-outline appt-cancel appt-neutral"
                            disabled={busy}
                            onClick={() => onReschedule(a)}
                          >
                            Reschedule
                          </button>
                        )}
                        {a.canCancel && (
                          <button
                            type="button"
                            className="button button-outline appt-cancel"
                            disabled={busy}
                            onClick={() => handleCancel(a)}
                          >
                            {busy ? "Please wait..." : "Cancel"}
                          </button>
                        )}
                        {a.canReview && (
                          <button
                            type="button"
                            className="button button-outline appt-cancel appt-neutral"
                            onClick={() => {
                              setReviewing(reviewing === a._id ? null : a._id);
                              setRating(0);
                              setComment("");
                            }}
                          >
                            <Star size={14} /> Rate
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {reviewing === a._id && (
                    <div className="review-form">
                      <div className="stars" role="radiogroup" aria-label="Rating">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={rating === n}
                            aria-label={`${n} star${n > 1 ? "s" : ""}`}
                            className={n <= rating ? "star on" : "star"}
                            onClick={() => setRating(n)}
                          >
                            <Star size={24} fill={n <= rating ? "currentColor" : "none"} />
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="booking-reason"
                        rows={2}
                        maxLength={500}
                        placeholder="How was your visit? (optional)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={busy}
                        onClick={() => handleReview(a)}
                      >
                        Submit review
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="booking-hint">
          You can cancel or reschedule up to 2 hours before the visit.
        </p>
      </div>
    </div>
  );
}