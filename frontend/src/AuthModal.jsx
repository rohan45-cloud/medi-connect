import { useState } from "react";

const API_URL = "http://localhost:5000/api";

// Same keys App.jsx uses to read the saved session
const TOKEN_KEY = "mediconnect_token";
const USER_KEY = "mediconnect_user";

async function post(path, body) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Is the backend running on port 5000?"
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong. Please try again.");
  }

  return data;
}

const REGISTER_LABELS = {
  patient: "Patient register",
  doctor: "Doctor register",
  admin: "Admin register",
};

const ROLE_LABELS = {
  patient: "Patient login",
  doctor: "Doctor login",
  admin: "Admin login",
};

// Props: onClose(), onSuccess(user, token), resetToken (set when the user opened the emailed reset link)
export default function AuthModal({ onClose, onSuccess, resetToken }) {
  // "login" | "register" | "forgot" | "reset"
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  // who is logging in: "patient" | "doctor" | "admin" (the server still decides the real role)
  const [loginAs, setLoginAs] = useState("patient");
  const [name, setName] = useState("");
  // extra fields, only used when a doctor applies
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [experience, setExperience] = useState("");
  const [fee, setFee] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";
  const applyingAsDoctor = isRegister && loginAs === "doctor";

  function switchMode(next) {
    setMode(next);
    setMessage("");
    setInfo("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    setInfo("");
    setLoading(true);

    try {
      const cleanEmail = email.trim();

      if (mode === "forgot") {
        const res = await post("/auth/forgot-password", { email: cleanEmail });
        setInfo(res.message);
        return;
      }

      if (mode === "reset") {
        const res = await post("/auth/reset-password", {
          token: resetToken,
          password,
        });
        // remove ?reset=... from the address bar
        window.history.replaceState({}, "", window.location.pathname);
        setPassword("");

        setMode("login");
        setInfo(res.message);
        return;
      }

      let data;
      if (applyingAsDoctor) {
        data = await post("/auth/register-doctor", {
          name: name.trim(),
          email: cleanEmail,
          password,
          specialty: specialty.trim(),
          city: city.trim(),
          experience,
          consultationFee: fee,
        });
      } else if (isRegister) {
        data = await post("/auth/register", {
          name: name.trim(),
          email: cleanEmail,
          password,
        });

        // If the register route does not return a token, log in right after.
        if (!data.token) {
          data = await post("/auth/login", { email: cleanEmail, password });
        }
      } else {
        data = await post("/auth/login", { email: cleanEmail, password });
      }

      if (!data.token) {
        throw new Error("The server did not return a login token.");
      }

      // Logged in with the wrong tab? Don't keep the session, tell the person which tab to use.
      if (!isRegister) {
        const realRole = data.user?.role || "patient";
        if (realRole !== loginAs) {
          throw new Error(
            `This is a ${realRole} account. Please choose "${ROLE_LABELS[realRole]}" above and log in again.`
          );
        }
      }

      // App.jsx calls currentUser.name.split(...), so always give it a name.
      const user = {
        ...(data.user || {}),
        name: data.user?.name || name.trim() || cleanEmail.split("@")[0],
        email: data.user?.email || cleanEmail,
      };

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      onSuccess?.(user, data.token);
      onClose();
    } catch (error) {
      setMessage(error.message || "Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  const titles = {
    login: ["Welcome Back", "Login to MediConnect"],
    register:
      loginAs === "doctor"
        ? ["Apply as a Doctor", "An admin approves you before patients can see you."]
        : ["Create Account", "Register for MediConnect"],
    forgot: ["Forgot password?", "We will email you a reset link."],
    reset: ["Choose a new password", "Use at least 8 characters."],
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={titles[mode][0]}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          style={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <h2>{titles[mode][0]}</h2>
        <p>{titles[mode][1]}</p>

        {(mode === "login" || mode === "register") && (
          <div style={styles.roles} role="tablist" aria-label="Account type">
            {Object.entries(mode === "login" ? ROLE_LABELS : REGISTER_LABELS).map(([role, label]) => (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={loginAs === role}
                style={loginAs === role ? styles.roleOn : styles.role}
                onClick={() => {
                  setLoginAs(role);
                  setMessage("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === "login" && loginAs === "admin" && (
          <p style={{ fontSize: 13, color: "#5f777a" }}>
            Only the clinic administrator can log in here.
          </p>
        )}

        {isRegister && loginAs === "admin" && (
          <p style={{ fontSize: 14, color: "#5f777a", lineHeight: 1.5 }}>
            Admin accounts can't be created from this page. The clinic owner
            creates the admin account on the server for safety.
          </p>
        )}

        <form onSubmit={handleSubmit} hidden={isRegister && loginAs === "admin"}>
          {isRegister && (
            <input
              style={styles.input}
              placeholder="Full Name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              required
            />
          )}

          {applyingAsDoctor && (
            <>
              <input
                style={styles.input}
                placeholder="Specialty (e.g. Cardiologist)"
                maxLength={60}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                required
              />
              <input
                style={styles.input}
                placeholder="City (optional)"
                maxLength={60}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  max="70"
                  placeholder="Experience (years)"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                />
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  max="100000"
                  placeholder="Fee (₹)"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
            </>
          )}

          {mode !== "reset" && (
            <input
              style={styles.input}
              type="email"
              placeholder="Email Address"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}

          {mode !== "forgot" && (
            <input
              style={styles.input}
              type="password"
              placeholder={
                mode === "reset"
                  ? "New password (minimum 8 characters)"
                  : "Password (minimum 8 characters)"
              }
              autoComplete={
                isRegister || mode === "reset" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          )}

          {message && (
            <p role="alert" style={{ color: "crimson" }}>
              {message}
            </p>
          )}
          {info && (
            <p role="status" style={{ color: "#17653f" }}>
              {info}
            </p>
          )}

          <button style={styles.submit} type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "register"
              ? applyingAsDoctor
                ? "Apply as doctor"
                : "Register"
              : mode === "forgot"
              ? "Send reset link"
              : mode === "reset"
              ? "Change password"
              : "Login"}
          </button>
        </form>

        {mode === "login" && (
          <p>
            <button
              type="button"
              style={styles.link}
              onClick={() => switchMode("forgot")}
            >
              Forgot password?
            </button>
          </p>
        )}

        {mode !== "reset" && !(mode === "login" && loginAs === "admin") && (
          <p>
            {isRegister ? "Already registered?" : mode === "forgot" ? "Remembered it?" : "Don't have an account?"}{" "}
            <button
              type="button"
              style={styles.link}
              onClick={() => switchMode(isRegister || mode === "forgot" ? "login" : "register")}
            >
              {isRegister || mode === "forgot" ? "Login" : "Register"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    position: "relative",
    background: "white",
    color: "#172033",
    padding: 28,
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    boxSizing: "border-box",
  },
  close: {
    position: "absolute",
    right: 14,
    top: 14,
    border: 0,
    background: "transparent",
    cursor: "pointer",
  },
  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    margin: "12px 0",
    border: "1px solid #ccc",
    borderRadius: 8,
  },
  submit: {
    width: "100%",
    padding: 12,
    background: "#159b80",
    color: "white",
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
  },
  roles: {
    display: "flex",
    gap: 6,
    margin: "14px 0 4px",
    padding: 4,
    background: "#eef5f3",
    borderRadius: 10,
  },
  role: {
    flex: 1,
    padding: "8px 4px",
    border: 0,
    borderRadius: 8,
    background: "transparent",
    color: "#5f777a",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  roleOn: {
    flex: 1,
    padding: "8px 4px",
    border: 0,
    borderRadius: 8,
    background: "#fff",
    color: "#10655f",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 1px 4px #0002",
  },
  link: {
    color: "#159b80",
    border: 0,
    background: "transparent",
    cursor: "pointer",
  },
};