import { useCallback, useEffect, useState } from "react";
import { X, Stethoscope, CheckCircle2, UserX, Ban, NotebookPen } from "lucide-react";
import { apiFetch } from "./api";
import { formatTime } from "./BookingModal";
import { ProfileTab, ScheduleTab } from "./DoctorSettings";
import { VisitDetails, WalkInTab, EarningsTab, formatDate, todayIST } from "./DoctorTools";
import VideoButton from "./VideoButton";

const TABS = [
  ["today", "Today"],
  ["upcoming", "Upcoming"],
  ["history", "History"],
  ["walkin", "Walk-in"],
  ["earnings", "Earnings"],
  ["profile", "Profile"],
  ["schedule", "Schedule"],
];

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
  const [openId, setOpenId] = useState(""); // visit whose details are open
  const [completingId, setCompletingId] = useState(""); // visit being completed (follow-up question)
  const [followUp, setFollowUp] = useState("");

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
    setOpenId("");
    setCompletingId("");
    if (isListTab) load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, load]);

  async function changeStatus(a, status, followUpDate) {
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
        body: { status, ...(followUpDate ? { followUpDate } : {}) },
      });
      onChanged(res.message || "Updated.");
      setCompletingId("");
      setFollowUp("");
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
            Upload your registration document in the Profile tab, and fill in your schedule meanwhile.
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
        {tab === "earnings" && <EarningsTab onAuthError={onAuthError} />}
        {tab === "walkin" && (
          <WalkInTab
            onChanged={(msg) => {
              onChanged(msg);
              apiFetch("/doctor/summary").then((res) => setInfo(res.data)).catch(() => {});
            }}
            onAuthError={onAuthError}
          />
        )}

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
                <li key={a._id} className="appt-item appt-item-col">
                  <div className="appt-row">
                    <div>
                      <strong>
                        {a.patient?.name || "Patient"}
                        {a.walkIn && <span className="walkin-tag">Walk-in</span>}
                      </strong>
                      <span className="appt-when">
                        {formatDate(a.date)} · {formatTime(a.time)}
                      </span>
                      {a.reason && <span className="appt-sub">“{a.reason}”</span>}
                      {a.walkIn && a.walkInPhone && <span className="appt-sub">Phone: {a.walkInPhone}</span>}
                      {a.followUpDate && (
                        <span className="appt-sub">Follow-up suggested: {formatDate(a.followUpDate)}</span>
                      )}
                    </div>

                    <div className="appt-side">
                      <span className={`appt-badge appt-${kind}`}>{label}</span>
                      <div className="dash-actions">

                                                <VideoButton appointment={a} onError={setError} onAuthError={onAuthError} />
                        {booked && started && (
                          <>
                            <button
                              type="button"
                              className="button button-primary appt-cancel dash-done"
                              disabled={busy}
                              onClick={() => {
                                setCompletingId(completingId === a._id ? "" : a._id);
                                setFollowUp("");
                              }}
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
                          </>
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
                        <button
                          type="button"
                          className="button button-outline appt-cancel appt-neutral"
                          aria-expanded={openId === a._id}
                          onClick={() => setOpenId(openId === a._id ? "" : a._id)}
                        >
                          <NotebookPen size={14} /> Notes
                        </button>
                      </div>
                    </div>
                  </div>

                  {completingId === a._id && (
                    <div className="followup-form">
                      <label>
                        Suggest a follow-up visit? (optional)
                        <input
                          type="date"
                          value={followUp}
                          min={todayIST(1)}
                          max={todayIST(365)}
                          onChange={(e) => setFollowUp(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={busy}
                        onClick={() => changeStatus(a, "completed", followUp)}
                      >
                        {followUp ? "Complete + suggest follow-up" : "Complete visit"}
                      </button>
                    </div>
                  )}

                  {openId === a._id && (
                    <VisitDetails appointment={a} onChanged={onChanged} onAuthError={onAuthError} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}