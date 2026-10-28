import { useEffect, useState } from "react";
import { X, UserRound } from "lucide-react";
import { apiFetch, USER_KEY } from "./api";

// The patient's own details: name, phone, and whether to get SMS / WhatsApp reminders.
export default function MyProfile({ onClose, onSaved, onAuthError }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/me/profile")
      .then((res) => setForm(res.data))
      .catch((err) => (err.status === 401 ? onAuthError() : setError(err.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/me/profile", {
        method: "PATCH",
        body: { name: form.name, phone: form.phone, smsReminders: form.smsReminders },
      });
      setForm(res.data);

      // keep the saved login in sync, so the new name shows in the navbar
      try {
        const saved = JSON.parse(localStorage.getItem(USER_KEY) || "{}");
        const user = { ...saved, name: res.data.name };
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        onSaved(user, "Profile saved.");
      } catch {
        onSaved(null, "Profile saved.");
      }
      onClose();
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="My profile"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 className="appt-title">
          <UserRound size={22} /> My profile
        </h2>

        {!form && !error && <p className="booking-hint">Loading...</p>}
        {!form && error && <p className="booking-error" role="alert">{error}</p>}

        {form && (
          <form className="settings-form" onSubmit={save}>
            <label>
              Full name
              <input
                type="text"
                minLength={2}
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Email (cannot be changed)
              <input type="email" value={form.email} disabled />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                maxLength={20}
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.smsReminders}
                onChange={(e) => setForm({ ...form, smsReminders: e.target.checked })}
              />
              <span>Also remind me by SMS / WhatsApp (needs a phone number)</span>
            </label>

            {error && <p className="booking-error" role="alert">{error}</p>}
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}