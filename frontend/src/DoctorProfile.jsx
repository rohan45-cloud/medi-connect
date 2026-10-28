import { useEffect, useState } from "react";
import { X, Star, Stethoscope, MapPin, Clock, Heart, CalendarClock } from "lucide-react";
import { apiFetch } from "./api";
import { formatTime } from "./BookingModal";

function prettyDay(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Everything about one doctor in one place: photo, about, next free slot, reviews, Book button.
// `onBook` / `onToggleFavorite` are only given to patient accounts.
export default function DoctorProfile({ doctor, onClose, onBook, isFavorite, onToggleFavorite }) {
  const [reviews, setReviews] = useState(null);
  const [next, setNext] = useState(undefined); // undefined = loading, null = none
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/doctors/${doctor._id}/reviews`)
      .then((res) => setReviews(res.data))
      .catch((err) => setError(err.message));
    apiFetch(`/doctors/${doctor._id}/next-slot`)
      .then((res) => setNext(res.data))
      .catch(() => setNext(null));
  }, [doctor._id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`About ${doctor.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <div className="profile-head">
          <div className="doctor-avatar profile-avatar">
            {doctor.image ? <img src={doctor.image} alt={doctor.name} /> : <Stethoscope size={40} />}
          </div>
          <div>
            <h2>{doctor.name}</h2>
            <p className="doctor-specialty">{doctor.specialty}</p>
            {doctor.city && (
              <p className="doctor-city">
                <MapPin size={14} /> {doctor.city}
              </p>
            )}
          </div>
        </div>

        <div className="profile-facts">
          <span>
            <Star size={15} fill="currentColor" /> {doctor.rating ?? 4.5}
            {doctor.reviewCount ? ` (${doctor.reviewCount} reviews)` : ""}
          </span>
          <span>
            <Clock size={15} /> {doctor.experience ?? 1} years experience
          </span>
          <span>₹{doctor.consultationFee ?? 500} per visit</span>
        </div>

        {doctor.about && <p className="doctor-about-full">{doctor.about}</p>}

        <div className="next-slot" role="status">
          <CalendarClock size={18} />
          {next === undefined ? (
            "Checking the next free slot..."
          ) : next ? (
            <span>
              Next available: <strong>{prettyDay(next.date)}, {formatTime(next.time)}</strong>
            </span>
          ) : (
            "No free slot in the next 2 weeks (or the doctor is paused)."
          )}
        </div>

        <div className="booking-actions">
          {onToggleFavorite && (
            <button
              type="button"
              className="button button-outline"
              aria-pressed={isFavorite}
              onClick={() => onToggleFavorite(doctor)}
            >
              <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
              {isFavorite ? "Saved" : "Save doctor"}
            </button>
          )}
          {onBook && (
            <button
              type="button"
              className="button button-primary"
              disabled={!doctor.available}
              onClick={() => onBook(doctor)}
            >
              {doctor.available ? "Book visit" : "Unavailable"}
            </button>
          )}
        </div>

        <h3 className="booking-label">What patients say</h3>
        {error && <p className="booking-error" role="alert">{error}</p>}
        {!reviews && !error && <p className="booking-hint">Loading...</p>}
        {reviews && reviews.length === 0 && (
          <p className="booking-hint">No reviews yet. Reviews appear after completed visits.</p>
        )}

        <ul className="appt-list">
          {(reviews || []).map((r) => (
            <li key={r._id} className="appt-item appt-item-col">
              <div className="review-stars" aria-label={`${r.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={15} fill={n <= r.rating ? "currentColor" : "none"} />
                ))}
                <strong>{r.patientName}</strong>
              </div>
              {r.comment && <span className="appt-sub">“{r.comment}”</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}