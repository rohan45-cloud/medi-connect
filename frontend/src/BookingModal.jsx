import { useEffect, useState } from "react";
import { X, Stethoscope } from "lucide-react";
import { apiFetch } from "./api";

const TIME_ZONE = "Asia/Kolkata";
const DAYS_TO_SHOW = 14;

// "YYYY-MM-DD" for a moment, in India time
function istDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

function nextDays() {
  const now = Date.now();
  return Array.from({ length: DAYS_TO_SHOW }, (_, i) =>
    istDate(new Date(now + i * 86400000))
  );
}

function dayParts(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const opts = { timeZone: "UTC" };
  return {
    weekday: d.toLocaleDateString("en-IN", { ...opts, weekday: "short" }),
    day: d.toLocaleDateString("en-IN", { ...opts, day: "numeric" }),
    month: d.toLocaleDateString("en-IN", { ...opts, month: "short" }),
  };
}

export function formatTime(time) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Without `appointment` = book a new visit. With `appointment` = move that visit to a new time.
export default function BookingModal({
  doctor,
  appointment,
  onClose,
  onBooked,
  onAuthError,
}) {
  const rescheduling = Boolean(appointment);
  const days = nextDays();
  const workingDays = doctor.schedule?.workingDays; // 0 = Sunday ... 6 = Saturday
  const worksOn = (d) =>
    !workingDays || workingDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const [date, setDate] = useState(days.find(worksOn) || days[0]);
  const [closed, setClosed] = useState(false);
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      setLoadingSlots(true);
      setTime("");

      try {
        const result = await apiFetch(
          `/appointments/slots?doctorId=${doctor._id}&date=${date}`
        );
        if (!cancelled) {
          setSlots(result.data.slots);
          setClosed(Boolean(result.data.closed));
        }
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401) return onAuthError();
        setSlots([]);
        setError(err.message);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, doctor._id, reloadKey]);

  async function handleBook() {
    if (!time) return;
    setSubmitting(true);
    setError("");

    try {
      if (rescheduling) {
        await apiFetch(`/appointments/${appointment._id}/reschedule`, {
          method: "PATCH",
          body: { date, time },
        });
        onBooked(`Moved to ${date} at ${formatTime(time)}.`);
      } else {
        await apiFetch("/appointments", {
          method: "POST",
          body: { doctorId: doctor._id, date, time, reason: reason.trim() },
        });
        onBooked(`Booked with ${doctor.name} on ${date} at ${formatTime(time)}.`);
      }
      onClose();
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
      // slot may have just been taken: refresh the list
      if (err.status === 409) setReloadKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card booking-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Book an appointment with ${doctor.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="booking-doctor">
          <span className="doctor-avatar booking-avatar">
            <Stethoscope size={28} />
          </span>
          <div>
            <h2>{rescheduling ? `Reschedule: ${doctor.name}` : doctor.name}</h2>
            <p>
              {doctor.specialty} · ₹{doctor.consultationFee ?? 500} per visit
            </p>
          </div>
        </div>

        <h3 className="booking-label">1. Choose a date</h3>
        <div className="day-picker" role="listbox" aria-label="Choose a date">
          {days.map((d) => {
            const p = dayParts(d);
            return (
              <button
                key={d}
                type="button"
                role="option"
                aria-selected={d === date}
                disabled={!worksOn(d)}
                title={worksOn(d) ? "" : "Doctor is off on this day"}
                className={d === date ? "day-chip active" : "day-chip"}
                onClick={() => {
                  setDate(d);
                  setError("");
                }}
              >
                <small>{p.weekday}</small>
                <strong>{p.day}</strong>
                <small>{p.month}</small>
              </button>
            );
          })}
        </div>

        <h3 className="booking-label">2. Choose a time</h3>
        {loadingSlots ? (
          <p className="booking-hint">Loading available times...</p>
        ) : slots.length === 0 ? (
          <p className="booking-hint">
            {closed
              ? "The doctor is off on this day. Please try another date."
              : "No free slots on this day. Please try another date."}
          </p>
        ) : (
          <div className="slot-grid" role="listbox" aria-label="Choose a time">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={s === time}
                className={s === time ? "slot-chip active" : "slot-chip"}
                onClick={() => setTime(s)}
              >
                {formatTime(s)}
              </button>
            ))}
          </div>
        )}

        {!rescheduling && (
          <>
            <h3 className="booking-label">3. Reason (optional)</h3>
            <textarea
              className="booking-reason"
              rows={2}
              maxLength={300}
              placeholder="e.g. fever since 2 days"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        )}

        {error && (
          <p className="booking-error" role="alert">
            {error}
          </p>
        )}

        <div className="booking-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!time || submitting}
            onClick={handleBook}
          >
            {submitting
              ? rescheduling ? "Moving..." : "Booking..."
              : time
              ? `${rescheduling ? "Move to" : "Confirm"} ${formatTime(time)}`
              : "Select a time"}
          </button>
        </div>
      </div>
    </div>
  );
}