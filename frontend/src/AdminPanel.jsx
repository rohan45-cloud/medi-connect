import { useCallback, useEffect, useState } from "react";
import { X, ShieldCheck, Download, FileText } from "lucide-react";
import { apiFetch, apiDownload } from "./api";

const TABS = [
  ["doctors", "Doctors"],
  ["users", "Users"],
  ["appointments", "Appointments"],
  ["refunds", "Refunds"],
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

  // runs a button action, shows its error in the panel, reloads the list
  async function act(task, reloadTab) {
    try {
      setError("");
      await task();
      await load(reloadTab || tab);
    } catch (err) {
      if (err.status === 401) return onAuthError();
      setError(err.message);
    }
  }

  const setApproved = (doctor, approved) =>
    act(async () => {
      const res = await apiFetch(`/admin/doctors/${doctor._id}`, { method: "PATCH", body: { approved } });
      onChanged(res.message);
    });

  const setBlocked = (user, blocked) => {
    if (blocked && !window.confirm(`Block ${user.name}? They will not be able to log in.`)) return;
    return act(async () => {
      const res = await apiFetch(`/admin/users/${user._id}`, { method: "PATCH", body: { blocked } });
      onChanged(res.message);
    });
  };

  const markRefunded = (row) => {
    if (!window.confirm(`Have you already refunded ₹${row.fee} to ${row.patient} in the Razorpay dashboard?`)) return;
    return act(async () => {
      const res = await apiFetch(`/admin/appointments/${row._id}/refund`, { method: "PATCH" });
      onChanged(res.message);
    });
  };

  const download = (path, filename) => act(() => apiDownload(path, filename), tab);

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
            <div><strong>{s.patients}</strong><span>Patients{s.blockedUsers ? ` (${s.blockedUsers} blocked)` : ""}</span></div>
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
              {key === "refunds" && s?.refundsPending ? ` (${s.refundsPending})` : ""}
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

        {tab === "appointments" && (
          <div className="csv-bar">
            <button
              type="button"
              className="button button-outline"
              onClick={() => download("/admin/export/appointments", "mediconnect-appointments.csv")}
            >
              <Download size={15} /> Appointments CSV
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => download("/admin/export/payments", "mediconnect-payments.csv")}
            >
              <Download size={15} /> Payments CSV
            </button>
          </div>
        )}

        {tab === "refunds" && (
          <div className="csv-bar">
            <button
              type="button"
              className="button button-outline"
              onClick={() => download("/admin/export/refunds", "mediconnect-refunds.csv")}
            >
              <Download size={15} /> Refunds CSV
            </button>
            <span className="booking-hint">
              Refund the money in the Razorpay dashboard first, then press "Mark refunded" here.
            </span>
          </div>
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
                    <span className="appt-sub">
                      Registration no: {d.registrationNumber ? <strong>{d.registrationNumber}</strong> : "not given"}
                    </span>
                    {d.hasCredential ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => download(`/admin/doctors/${d._id}/credential`, `${d.name.replace(/[^A-Za-z0-9]+/g, "-")}-document`)}
                      >
                        <FileText size={14} /> View uploaded document
                      </button>
                    ) : (
                      <span className="appt-sub">No document uploaded</span>
                    )}
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
                  <div className="appt-side">
                    <span className="appt-badge appt-past">{u.role}</span>
                    {u.blocked && <span className="appt-badge appt-cancelled">Blocked</span>}
                    {u.role !== "admin" && (
                      <button
                        type="button"
                        className={`button button-outline appt-cancel${u.blocked ? " appt-neutral" : ""}`}
                        onClick={() => setBlocked(u, !u.blocked)}
                      >
                        {u.blocked ? "Unblock" : "Block"}
                      </button>
                    )}
                  </div>
                </li>
              ))}

            {tab === "appointments" &&
              rows.map((a) => (
                <li key={a._id} className="appt-item">
                  <div>
                    <strong>{a.patient || "Walk-in"} → {a.doctor || "Doctor"}</strong>
                    <span className="appt-sub">{a.date} · {a.time} · ₹{a.fee}</span>
                  </div>
                  <div className="appt-side">
                    <span className="appt-badge appt-past">{a.status}</span>
                    {a.paymentStatus !== "unpaid" && <span className="appt-badge appt-completed">{a.paymentStatus}</span>}
                  </div>
                </li>
              ))}

            {tab === "refunds" &&
              rows.map((r) => (
                <li key={r._id} className="appt-item">
                  <div>
                    <strong>{r.patient || "Patient"} · ₹{r.fee}</strong>
                    <span className="appt-sub">
                      {r.doctor || "Doctor"} · {r.date} {r.time}
                    </span>
                    <span className="appt-sub mono">Payment id: {r.paymentId || "—"}</span>
                  </div>
                  <div className="appt-side">
                    <span className={`appt-badge ${r.paymentStatus === "refunded" ? "appt-completed" : "appt-noshow"}`}>
                      {r.paymentStatus === "refunded" ? "Refunded" : "Refund pending"}
                    </span>
                    {r.paymentStatus === "refund-pending" && (
                      <button
                        type="button"
                        className="button button-primary appt-cancel dash-done"
                        onClick={() => markRefunded(r)}
                      >
                        Mark refunded
                      </button>
                    )}
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