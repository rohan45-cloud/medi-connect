import { useEffect, useState } from "react";
import { apiFetch, apiUpload } from "./api";
import { formatTime } from "./BookingModal";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_OPTIONS = [15, 20, 30, 45, 60];

const toMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const pad = (n) => String(n).padStart(2, "0");

// Same rule as the server (utils/schedule.js): every slot time of a day for this schedule
function slotTimes(f) {
  if (!f.startTime || !f.endTime || !f.slotMinutes) return [];
  const step = Number(f.slotMinutes);
  const hasBreak = f.breakStart && f.breakEnd;
  const times = [];
  for (let m = toMinutes(f.startTime); m + step <= toMinutes(f.endTime); m += step) {
    if (hasBreak && m < toMinutes(f.breakEnd) && m + step > toMinutes(f.breakStart)) continue;
    times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return times;
}

function sizeLabel(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- Profile: fee, experience, city, about, photo + registration proof ----------
export function ProfileTab({ onChanged, onAuthError }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    apiFetch("/doctor/profile")
      .then((res) => setForm(res.data))
      .catch((err) => (err.status === 401 ? onAuthError() : setError(err.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!form) return error ? <p className="booking-error" role="alert">{error}</p> : <p className="booking-hint">Loading...</p>;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/doctor/profile", {
        method: "PATCH",
        body: {
          consultationFee: form.consultationFee,
          experience: form.experience,
          city: form.city,
          about: form.about,
          image: form.image,
        },
      });
      setForm(res.data);
      onChanged("Profile saved.");
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadCredential(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiUpload("/doctor/credential", file);
      setForm({ ...form, credential: res.data });
      onChanged("Document uploaded. The admin will check it.");
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <form className="settings-form" onSubmit={save}>
        <p className="booking-hint">
          Rating: ★ {form.rating} ({form.reviewCount} review{form.reviewCount === 1 ? "" : "s"}).
          Your name and specialty are changed by the admin.
        </p>
        <div className="settings-grid">
          <label>
            Consultation fee (₹)
            <input type="number" min="0" max="100000" value={form.consultationFee} onChange={set("consultationFee")} required />
          </label>
          <label>
            Experience (years)
            <input type="number" min="0" max="70" value={form.experience} onChange={set("experience")} required />
          </label>
          <label>
            City
            <input type="text" maxLength={60} value={form.city} onChange={set("city")} />
          </label>
          <label>
            Photo link (https://...)
            <input type="url" maxLength={300} value={form.image} onChange={set("image")} placeholder="optional" />
          </label>
        </div>
        <label>
          About you (shown to patients)
          <textarea rows={3} maxLength={500} value={form.about} onChange={set("about")} />
        </label>
        {error && <p className="booking-error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>

      <div className="cred-box">
        <strong>Registration proof</strong>
        <p className="booking-hint">
          Medical registration number: <strong>{form.registrationNumber || "not given"}</strong>
        </p>
        {form.credential ? (
          <p className="booking-hint" role="status">
            Uploaded: <strong>{form.credential.name}</strong> ({sizeLabel(form.credential.size)}). Upload again to replace it.
          </p>
        ) : (
          <p className="booking-hint">
            Upload your degree or registration certificate (PDF, PNG or JPG, up to 2 MB). The admin checks it before approving you.
          </p>
        )}
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          disabled={uploading}
          onChange={uploadCredential}
          aria-label="Upload registration document"
        />
        {uploading && <p className="booking-hint">Uploading...</p>}
      </div>
    </>
  );
}

// ---------- Schedule: working days, hours, slot length, break, walk-in slots ----------
export function ScheduleTab({ onChanged, onAuthError }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/doctor/profile")
      .then((res) => setForm({ ...res.data.schedule, reservedTimes: res.data.schedule.reservedTimes || [] }))
      .catch((err) => (err.status === 401 ? onAuthError() : setError(err.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!form) return error ? <p className="booking-error" role="alert">{error}</p> : <p className="booking-hint">Loading...</p>;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleDay = (d) =>
    setForm({
      ...form,
      workingDays: form.workingDays.includes(d)
        ? form.workingDays.filter((x) => x !== d)
        : [...form.workingDays, d].sort(),
    });
  const toggleReserved = (t) =>
    setForm({
      ...form,
      reservedTimes: form.reservedTimes.includes(t)
        ? form.reservedTimes.filter((x) => x !== t)
        : [...form.reservedTimes, t].sort(),
    });

  const times = slotTimes(form);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/doctor/schedule", {
        method: "PATCH",
        body: { ...form, slotMinutes: Number(form.slotMinutes) },
      });
      setForm({ ...res.data, reservedTimes: res.data.reservedTimes || [] });
      onChanged("Schedule saved. It applies to new bookings.");
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={save}>
      <p className="booking-hint">
        Patients can only book inside these hours. Visits that are already booked are not changed.
      </p>

      <div className="day-toggle" role="group" aria-label="Working days">
        {DAY_NAMES.map((name, d) => (
          <button
            key={name}
            type="button"
            aria-pressed={form.workingDays.includes(d)}
            className={form.workingDays.includes(d) ? "day-pill on" : "day-pill"}
            onClick={() => toggleDay(d)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="settings-grid">
        <label>
          Start time
          <input type="time" value={form.startTime} onChange={set("startTime")} required />
        </label>
        <label>
          End time
          <input type="time" value={form.endTime} onChange={set("endTime")} required />
        </label>
        <label>
          Break from (optional)
          <input type="time" value={form.breakStart} onChange={set("breakStart")} />
        </label>
        <label>
          Break until
          <input type="time" value={form.breakEnd} onChange={set("breakEnd")} />
        </label>
        <label>
          Minutes per visit
          <select value={form.slotMinutes} onChange={set("slotMinutes")}>
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <strong className="field-title">Keep slots for walk-ins / emergencies</strong>
        <p className="booking-hint">
          Tap a time to keep it for yourself. Patients cannot book these slots, only you can fill them in the Walk-in tab.
        </p>
        {times.length === 0 ? (
          <p className="booking-hint">These hours leave no slots.</p>
        ) : (
          <div className="slot-grid" role="group" aria-label="Slots kept for walk-ins">
            {times.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={form.reservedTimes.includes(t)}
                className={form.reservedTimes.includes(t) ? "slot-chip reserved-on" : "slot-chip"}
                onClick={() => toggleReserved(t)}
              >
                {formatTime(t)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="booking-error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={saving}>
        {saving ? "Saving..." : "Save schedule"}
      </button>
    </form>
  );
}