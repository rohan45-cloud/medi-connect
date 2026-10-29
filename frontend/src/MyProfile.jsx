import { useEffect, useState } from "react";
import { X, UserRound } from "lucide-react";
import { apiFetch, USER_KEY } from "./api";

// The patient's own details: name, phone, and whether to get SMS / WhatsApp reminders.
export default function MyProfile({ onClose, onSaved, onAuthError }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // the phone number as it is saved on the server (the input may differ while typing)
  const [savedPhone, setSavedPhone] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/me/profile")
      .then((res) => {
        setForm(res.data);
        setSavedPhone(res.data.phone || "");
      })
      .catch((err) => (err.status === 401 ? onAuthError() : setError(err.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await apiFetch("/me/profile", {
        method: "PATCH",
        body: { name: form.name, phone: form.phone, smsReminders: form.smsReminders },
      });
      setForm(res.data);
      setSavedPhone(res.data.phone || "");
      setCode("");

      // keep the saved login in sync, so the new name shows in the navbar
      try {
        const saved = JSON.parse(localStorage.getItem(USER_KEY) || "{}");
        const user = { ...saved, name: res.data.name };
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        onSaved(user, "Profile saved.");
      } catch {
        onSaved(null, "Profile saved.");
      }
      // a saved but unverified number: stay open so the person can verify it now
      if (res.data.phone && !res.data.phoneVerified) {
        setInfo("Saved. Now verify your number below to log in or reset your password with it.");
      } else {
        onClose();
      }
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await apiFetch("/me/phone/send-code", { method: "POST" });
      setInfo(res.message || "Code sent.");
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await apiFetch("/me/phone/verify", { method: "POST", body: { code: code.trim() } });
      setForm((f) => ({ ...f, phoneVerified: true }));
      setCode("");
      setInfo(res.message || "Phone number verified.");
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const phoneChanged = form ? (form.phone || "").trim() !== savedPhone : false;

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

            {savedPhone && !phoneChanged && form.phoneVerified && (
              <p className="booking-hint">✔ Phone verified. You can log in and reset your password with it.</p>
            )}
            {savedPhone && !phoneChanged && !form.phoneVerified && (
              <div className="booking-hint">
                <p style={{ margin: "0 0 8px" }}>Not verified yet. We will text you a 6-digit code.</p>
                <button type="button" className="button button-secondary" onClick={sendCode} disabled={busy}>
                  Send code
                </button>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    aria-label="Verification code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={verifyCode}
                    disabled={busy || code.length !== 6}
                  >
                    Verify
                  </button>
                </div>
              </div>
            )}
            {phoneChanged && (
              <p className="booking-hint">Save the profile first, then you can verify the new number.</p>
            )}

            <label className="check-row">
              <input
                type="checkbox"
                checked={form.smsReminders}
                onChange={(e) => setForm({ ...form, smsReminders: e.target.checked })}
              />
              <span>Also remind me by SMS / WhatsApp (needs a phone number)</span>
            </label>

            {error && <p className="booking-error" role="alert">{error}</p>}
            {info && <p className="booking-hint" role="status">{info}</p>}
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
