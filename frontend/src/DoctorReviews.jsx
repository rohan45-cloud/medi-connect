import { useEffect, useState } from "react";
import { X, Star } from "lucide-react";
import { apiFetch } from "./api";

// Public list of what patients said about one doctor.
export default function DoctorReviews({ doctor, onClose }) {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/doctors/${doctor._id}/reviews`)
      .then((res) => setReviews(res.data))
      .catch((err) => setError(err.message));
  }, [doctor._id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Reviews of ${doctor.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 className="appt-title">{doctor.name}</h2>
        <p className="booking-hint">
          ★ {doctor.rating} · {doctor.reviewCount || 0} review{doctor.reviewCount === 1 ? "" : "s"}
          {doctor.city ? ` · ${doctor.city}` : ""}
        </p>
        {doctor.about && <p className="doctor-about-full">{doctor.about}</p>}

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