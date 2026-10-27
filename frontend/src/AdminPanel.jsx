import { useCallback, useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { apiFetch } from "./api";

const TABS = [
  ["doctors", "Doctors"],
  ["users", "Users"],
  ["appointments", "Appointments"],
];

const EMPTY = { name: "", email: "", specialty: "", city: "", experience: "", consultationFee: "" };

export default function AdminPanel({ onClose, onChanged, onAuthError }) {
  const [tab, setTab] = useState("doctors");
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState(null); // { email, tempPassword }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (which) => {
    try {
      setLoading(true);
      setError("");
      const [s, list] = await Promise.all([apiFetch("/admin/stats"), apiFetch(`/admin/${which}`)]);
      setStats(s.data);
      setRows(list.data);
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function setApproved(doctor, approved) {
    try {
      setError("");
      const res = await apiFetch(`/admin/doctors/${doctor._id}`, { method: "PATCH", body: { approved } });
      onChanged(res.message);
      await load("doctors");
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    }
  }

  async function addDoctor(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setCreated(null);
    try {
      const res = await apiFetch("/admin/doctors", { method: "POST", body: form });
      setCreated(res.data.login);
      setForm(EMPTY);
      onChanged("Doctor created.");
      await load("doctors");
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const s = stats;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Admin panel"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 className="appt-title">
          <ShieldCheck size={22} /> Admin panel
        </h2>

        {s && (
          <div className="dash-cards">
            <div><strong>{s.patients}</strong><span>Patients</span></div>
            <div><strong>{s.doctors}</strong><span>Doctors{s.pendingDoctors ? ` (${s.pendingDoctors} hidden)` : ""}</span></div>
            <div><strong>{s.appointments}</strong><span>Appointments</span></div>
            <div><strong>₹{s.revenue}</strong><span>Paid online{s.refundsPending ? ` · ${s.refundsPending} refund(s) due` : ""}</span></div>
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

        {error && <p className="booking-error" role="alert">{error}</p>}

        {tab === "doctors" && (
          <form className="settings-form admin-add" onSubmit={addDoctor}>
            <strong>Add a doctor (creates their login too)</strong>
            <div className="settings-grid">
              <input placeholder="Full name (Dr. ...)" value={form.name} onChange={set("name")} required />
              <input type="email" placeholder="Login email" value={form.email} onChange={set("email")} required />
              <input placeholder="Specialty" value={form.specialty} onChange={set("specialty")} required />
              <input placeholder="City" value={form.city} onChange={set("city")} />
              <input type="number" min="0" placeholder="Experience (years)" value={form.experience} onChange={set("experience")} />
              <input type="number" min="0" placeholder="Fee (₹)" value={form.consultationFee} onChange={set("consultationFee")} />
            </div>
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Adding..." : "Add doctor"}
            </button>
            {created && (
              <p className="booking-hint" role="status">
                Login: <strong>{created.email}</strong>
                {created.tempPassword && (
                  <> · temporary password: <strong>{created.tempPassword}</strong> (shown only once, share it with the doctor)</>
                )}
              </p>
            )}
          </form>
        )}

        {loading ? (
          <p className="booking-hint">Loading...</p>
        ) : (
          <ul className="appt-list">
            {tab === "doctors" &&
              rows.map((d) => (
                <li key={d._id} className="appt-item">
                  <div>
                    <strong>{d.name}</strong>
                    <span className="appt-sub">{d.specialty}{d.city ? ` · ${d.city}` : ""} · ₹{d.consultationFee}</span>
                  </div>
                  <div className="appt-side">
                    <span className={`appt-badge ${d.approved === false ? "appt-noshow" : "appt-upcoming"}`}>
                      {d.approved === false ? "Hidden" : "Visible"}
                    </span>
                    <button
                      type="button"
                      className="button button-outline appt-cancel appt-neutral"
                      onClick={() => setApproved(d, d.approved === false)}
                    >
                      {d.approved === false ? "Approve" : "Hide"}
                    </button>
                  </div>
                </li>
              ))}

            {tab === "users" &&
              rows.map((u) => (
                <li key={u._id} className="appt-item">
                  <div>
                    <strong>{u.name}</strong>
                    <span className="appt-sub">{u.email}</span>
                  </div>
                  <span className="appt-badge appt-past">{u.role}</span>
                </li>
              ))}

            {tab === "appointments" &&
              rows.map((a) => (
                <li key={a._id} className="appt-item">
                  <div>
                    <strong>{a.patient || "Patient"} → {a.doctor || "Doctor"}</strong>
                    <span className="appt-sub">{a.date} · {a.time} · ₹{a.fee}</span>
                  </div>
                  <div className="appt-side">
                    <span className="appt-badge appt-past">{a.status}</span>
                    {a.paymentStatus !== "unpaid" && <span className="appt-badge appt-completed">{a.paymentStatus}</span>}
                  </div>
                </li>
              ))}
            {rows.length === 0 && <p className="booking-hint">Nothing here yet.</p>}
          </ul>
        )}
      </div>
    </div>
  );
}