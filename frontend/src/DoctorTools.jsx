import { useCallback, useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { apiFetch, apiDownload } from "./api";
import { formatTime } from "./BookingModal";

const TIME_ZONE = "Asia/Kolkata";

// Today's date in India, "YYYY-MM-DD"
export function todayIST(addDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
    new Date(Date.now() + addDays * 86400000)
  );
}

export function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function monthLabel(key) {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}

function sizeLabel(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- One visit: earlier visits, files from the patient, private notes ----------
export function VisitDetails({ appointment, onChanged, onAuthError }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/doctor/appointments/${appointment._id}/history`);
      setData(res.data);
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/doctor/appointments/${appointment._id}/notes`, {
        method: "POST",
        body: { text: text.trim() },
      });
      setText("");
      onChanged("Note saved.");
      await load();
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(note) {
    if (!window.confirm("Delete this note?")) return;
    try {
      await apiFetch(`/doctor/notes/${note._id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    }
  }

  async function download(file) {
    try {
      await apiDownload(`/reports/file/${file._id}`, file.name);
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    }
  }

  return (
    <div className="visit-details">
      {error && <p className="booking-error" role="alert">{error}</p>}
      {!data && !error && <p className="booking-hint">Loading...</p>}

      {data && (
        <>
          <h4>Files from the patient</h4>
          {data.reports.length === 0 ? (
            <p className="booking-hint">No files attached.</p>
          ) : (
            <ul className="file-list">
              {data.reports.map((f) => (
                <li key={f._id}>
                  <button type="button" className="link-btn" onClick={() => download(f)}>
                    <Download size={14} /> {f.name}
                  </button>
                  <span className="appt-sub">{sizeLabel(f.size)}</span>
                </li>
              ))}
            </ul>
          )}

          <h4>Earlier visits with you</h4>
          {data.visits.length === 0 ? (
            <p className="booking-hint">This is the first visit with you.</p>
          ) : (
            <ul className="mini-list">
              {data.visits.map((v) => (
                <li key={v._id}>
                  <strong>{formatDate(v.date)} · {formatTime(v.time)}</strong>
                  <span className={`appt-badge appt-${v.status === "no-show" ? "noshow" : v.status === "booked" ? "upcoming" : v.status}`}>
                    {v.status}
                  </span>
                  {v.reason && <span className="appt-sub">“{v.reason}”</span>}
                </li>
              ))}
            </ul>
          )}

          <h4>Your private notes (the patient cannot see these)</h4>
          {data.notes.length === 0 && <p className="booking-hint">No notes yet.</p>}
          <ul className="mini-list">
            {data.notes.map((n) => (
              <li key={n._id} className="note-item">
                <div>
                  <span className="appt-sub">
                    {new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {n.thisVisit ? " · this visit" : ""}
                  </span>
                  <p>{n.text}</p>
                </div>
                <button
                  type="button"
                  className="link-btn danger"
                  aria-label="Delete note"
                  onClick={() => removeNote(n)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>

          <form className="note-form" onSubmit={addNote}>
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="Write a note about this patient..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="New note"
            />
            <button type="submit" className="button button-primary" disabled={saving || !text.trim()}>
              {saving ? "Saving..." : "Add note"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

// ---------- Walk-in / emergency visits ----------
export function WalkInTab({ onChanged, onAuthError }) {
  const [date, setDate] = useState(todayIST());
  const [slots, setSlots] = useState([]);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTime("");
    apiFetch(`/doctor/walkin-slots?date=${date}`)
      .then((res) => {
        if (cancelled) return;
        setSlots(res.data.slots);
        setClosed(Boolean(res.data.closed));
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) return onAuthError();
        setSlots([]);
        setError(err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reloadKey]);

  async function submit(e) {
    e.preventDefault();
    if (!time) return setError("Please choose a time slot.");
    setSaving(true);
    setError("");
    try {
      await apiFetch("/doctor/walkin", {
        method: "POST",
        body: { date, time, name: name.trim(), phone: phone.trim(), reason: reason.trim() },
      });
      onChanged(`Walk-in added: ${name.trim()} at ${formatTime(time)}.`);
      setName("");
      setPhone("");
      setReason("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
      if (err.status === 409) setReloadKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <p className="booking-hint">
        Add a patient who walked in or an emergency. The slot is blocked, so nobody else can book it.
        Slots marked "kept for walk-ins" (set in the Schedule tab) are only visible here.
      </p>

      <label>
        Date
        <input
          type="date"
          value={date}
          min={todayIST()}
          max={todayIST(30)}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          required
        />
      </label>

      {loading ? (
        <p className="booking-hint">Loading slots...</p>
      ) : closed ? (
        <p className="booking-hint">You don't work on this day.</p>
      ) : slots.length === 0 ? (
        <p className="booking-hint">No free slots left on this day.</p>
      ) : (
        <div className="slot-grid" role="listbox" aria-label="Choose a slot">
          {slots.map((s) => (
            <button
              key={s.time}
              type="button"
              role="option"
              aria-selected={s.time === time}
              className={s.time === time ? "slot-chip active" : s.reserved ? "slot-chip reserved" : "slot-chip"}
              onClick={() => setTime(s.time)}
              title={s.reserved ? "Kept for walk-ins" : ""}
            >
              {formatTime(s.time)}
              {s.reserved && <small className="slot-tag">walk-in</small>}
            </button>
          ))}
        </div>
      )}

      <div className="settings-grid">
        <label>
          Patient name
          <input type="text" minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Phone (optional)
          <input type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <label>
        Reason (optional)
        <input type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>

      {error && <p className="booking-error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={saving || !time}>
        {saving ? "Adding..." : "Add walk-in visit"}
      </button>
    </form>
  );
}

// ---------- Earnings ----------
export function EarningsTab({ onAuthError }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/doctor/earnings")
      .then((res) => setData(res.data))
      .catch((err) => (err.status === 401 ? onAuthError() : setError(err.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="booking-error" role="alert">{error}</p>;
  if (!data) return <p className="booking-hint">Loading...</p>;

  return (
    <div>
      <div className="dash-cards">
        <div><strong>₹{data.thisMonthAmount}</strong><span>This month ({data.thisMonthVisits} visits)</span></div>
        <div><strong>₹{data.completedAmount}</strong><span>All time ({data.completedVisits} visits)</span></div>
        <div><strong>₹{data.paidOnline}</strong><span>Paid online</span></div>
        <div><strong>₹{data.upcomingAmount}</strong><span>Upcoming ({data.upcomingVisits} visits)</span></div>
      </div>

      <h3 className="booking-label">Month by month</h3>
      {data.months.length === 0 ? (
        <p className="booking-hint">No completed visits yet. Mark a visit as Complete and it will show here.</p>
      ) : (
        <table className="earn-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Visits</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month)}</td>
                <td>{m.visits}</td>
                <td>₹{m.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="booking-hint">
        Earnings count the fee of every visit you marked Complete. Cash taken at the clinic is included, because the app only knows the fee.
      </p>
    </div>
  );
}