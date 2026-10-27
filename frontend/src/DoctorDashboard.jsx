import { useCallback, useEffect, useState } from "react";
import { X, Stethoscope, CheckCircle2, UserX, Ban } from "lucide-react";
import { apiFetch } from "./api";
import { formatTime } from "./BookingModal";
import { ProfileTab, ScheduleTab } from "./DoctorSettings";

const TABS = [
  ["today", "Today"],
  ["upcoming", "Upcoming"],
  ["history", "History"],
  ["profile", "Profile"],
  ["schedule", "Schedule"],
];

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function badgeOf(a) {
  if (a.status === "completed") return ["completed", "Completed"];
  if (a.status === "no-show") return ["noshow", "No-show"];
  if (a.status === "cancelled") {
    return ["cancelled", a.cancelledBy === "doctor" ? "Cancelled by you" : "Cancelled by patient"];
  }
  return new Date(a.startAt).getTime() <= Date.now()
    ? ["pending", "Waiting for you"]
    : ["upcoming", "Upcoming"];
}

export default function DoctorDashboard({ onClose, onChanged, onAuthError }) {
  const [tab, setTab] = useState("today");
  const [info, setInfo] = useState(null); // { doctor, summary }
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(
    async (scope) => {
      try {
        setLoading(true);
        setError("");
        const [summary, appts] = await Promise.all([
          apiFetch("/doctor/summary"),
          apiFetch(`/doctor/appointments?scope=${scope}`),
        ]);
        setInfo(summary.data);
        setList(appts.data);
      } catch (err) {
        if (err.status === 401) return onAuthError();
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const isListTab = ["today", "upcoming", "history"].includes(tab);

  useEffect(() => {
    if (isListTab) load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, load]);

  async function changeStatus(a, status) {
    if (status === "cancelled") {
      const ok = window.confirm(
        `Cancel ${a.patient?.name || "this patient"}'s appointment on ${formatDate(a.date)} at ${formatTime(a.time)}?`
      );
      if (!ok) return;
    }
    try {
      setBusyId(a._id);
      setError("");
      const res = await apiFetch(`/doctor/appointments/${a._id}/status`, {
        method: "PATCH",
        body: { status },
      });
      onChanged(res.message || "Updated.");
      await load(tab);
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function toggleAvailability() {
    try {
      setError("");
      const res = await apiFetch("/doctor/availability", {
        method: "PATCH",
        body: { available: !info.doctor.available },
      });
      setInfo({ ...info, doctor: { ...info.doctor, available: res.data.available } });
      onChanged(
        res.data.available
          ? "You are now accepting bookings."
          : "You are paused. Patients can't book you."
      );
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    }
  }

  const s = info?.summary;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Doctor dashboard"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 className="appt-title">
          <Stethoscope size={22} /> Doctor dashboard
        </h2>

        {info && (
          <div className="dash-head">
            <div>
              <strong>{info.doctor.name}</strong>
              <span className="appt-sub">{info.doctor.specialty}</span>
            </div>
            <button
              type="button"
              className={`button ${info.doctor.available ? "button-outline" : "button-primary"}`}
              onClick={toggleAvailability}
            >
              {info.doctor.available ? "Pause bookings" : "Accept bookings again"}
            </button>
          </div>
        )}

        {info && info.doctor.approved === false && (
          <p className="booking-error" role="status">
            Your profile is waiting for admin approval. Patients can't see or book you yet.
            You can fill in your profile and schedule meanwhile.
          </p>
        )}

        {s && (
          <div className="dash-cards">
            <div><strong>{s.today}</strong><span>Today</span></div>
            <div><strong>{s.upcoming}</strong><span>Upcoming</span></div>
            <div><strong>{s.completed}</strong><span>Completed</span></div>
            <div><strong>{s.missedOrCancelled}</strong><span>Missed / cancelled</span></div>
          </div>
        )}

        <div className="dash-tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "dash-tab active" : "dash-tab"}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="booking-error" role="alert">
            {error}
          </p>
        )}

        {tab === "profile" && <ProfileTab onChanged={onChanged} onAuthError={onAuthError} />}
        {tab === "schedule" && <ScheduleTab onChanged={onChanged} onAuthError={onAuthError} />}

        {!isListTab ? null : loading ? (
          <p className="booking-hint">Loading...</p>
        ) : list.length === 0 ? (
          <p className="booking-hint">No appointments here.</p>
        ) : (
          <ul className="appt-list">
            {list.map((a) => {
              const [kind, label] = badgeOf(a);
              const booked = a.status === "booked";
              const started = new Date(a.startAt).getTime() <= Date.now();
              const busy = busyId === a._id;
              return (
                <li key={a._id} className="appt-item">
                  <div>
                    <strong>{a.patient?.name || "Patient"}</strong>
                    <span className="appt-when">
                      {formatDate(a.date)} · {formatTime(a.time)}
                    </span>
                    {a.reason && <span className="appt-sub">“{a.reason}”</span>}
                  </div>

                  <div className="appt-side">
                    <span className={`appt-badge appt-${kind}`}>{label}</span>
                    {booked && started && (
                      <div className="dash-actions">
                        <button
                          type="button"
                          className="button button-primary appt-cancel dash-done"
                          disabled={busy}
                          onClick={() => changeStatus(a, "completed")}
                        >
                          <CheckCircle2 size={14} /> Complete
                        </button>
                        <button
                          type="button"
                          className="button button-outline appt-cancel"
                          disabled={busy}
                          onClick={() => changeStatus(a, "no-show")}
                        >
                          <UserX size={14} /> No-show
                        </button>
                      </div>
                    )}
                    {booked && !started && (
                      <button
                        type="button"
                        className="button button-outline appt-cancel"
                        disabled={busy}
                        onClick={() => changeStatus(a, "cancelled")}
                      >
                        <Ban size={14} /> Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}