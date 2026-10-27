import { useEffect, useState } from "react";
import { apiFetch } from "./api";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_OPTIONS = [15, 20, 30, 45, 60];

// ---------- Profile: fee, experience, city, about, photo ----------
export function ProfileTab({ onChanged, onAuthError }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
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
  );
}

// ---------- Schedule: working days, hours, slot length, break ----------
export function ScheduleTab({ onChanged, onAuthError }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/doctor/profile")
      .then((res) => setForm({ ...res.data.schedule }))
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

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/doctor/schedule", {
        method: "PATCH",
        body: { ...form, slotMinutes: Number(form.slotMinutes) },
      });
      setForm({ ...res.data });
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

      {error && <p className="booking-error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={saving}>
        {saving ? "Saving..." : "Save schedule"}
      </button>
    </form>
  );
}