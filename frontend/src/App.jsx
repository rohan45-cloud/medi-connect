
import { useEffect, useState } from "react";
import {
  HeartPulse,
  Search,
  ArrowRight,
  Star,
  Clock,
  ShieldCheck,
  Stethoscope,
  Users,
  CalendarCheck,
  LayoutDashboard,
  ShieldCheck as ShieldIcon,
  MapPin,
  Heart,
  UserRound,
  X,
} from "lucide-react";
import AuthModal from "./AuthModal";
import BookingModal from "./BookingModal";
import MyAppointments from "./MyAppointments";
import DoctorDashboard from "./DoctorDashboard";
import AdminPanel from "./AdminPanel";
import DoctorProfile from "./DoctorProfile";
import MyProfile from "./MyProfile";
import { apiFetch } from "./api";
import "./index.css";

const API_URL = "https://medi-connect-1-4ugc.onrender.com/api";

export default function App() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doctorError, setDoctorError] = useState("");
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [showAuth, setShowAuth] = useState(Boolean(new URLSearchParams(window.location.search).get("reset")));
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [showAppointments, setShowAppointments] = useState(false);
  const [showDoctorDashboard, setShowDoctorDashboard] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [reschedule, setReschedule] = useState(null); // { appointment, doctor }
  const [profileDoctor, setProfileDoctor] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [favorites, setFavorites] = useState([]); // doctor ids the patient saved
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [city, setCity] = useState("All");
  const [maxFee, setMaxFee] = useState("any");
  const [sortBy, setSortBy] = useState("rating");
  // ?reset=TOKEN in the address = the person clicked the link in the reset email
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset") || "");
  const [notice, setNotice] = useState("");
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("mediconnect_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    async function fetchDoctors() {
      try {
        setLoading(true);
        setDoctorError("");

        const response = await fetch(`${API_URL}/doctors`);

        if (!response.ok) {
          throw new Error("Could not load doctors.");
        }

        const data = await response.json();
        setDoctors(Array.isArray(data) ? data : data.data || data.doctors || []);
      } catch (error) {
        setDoctorError(
          "Unable to load doctors. Please check whether the backend is running."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchDoctors();
  }, []);

  // Saved doctors (patients only)
  useEffect(() => {
    if (!currentUser || (currentUser.role || "patient") !== "patient") {
      setFavorites([]);
      setOnlyFavorites(false);
      return;
    }
    apiFetch("/me/favorites")
      .then((res) => setFavorites(res.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  async function toggleFavorite(doctor) {
    const saved = favorites.includes(doctor._id);
    try {
      await apiFetch(`/me/favorites/${doctor._id}`, { method: saved ? "DELETE" : "PUT" });
      setFavorites(saved ? favorites.filter((id) => id !== doctor._id) : [...favorites, doctor._id]);
      showDemoNotice(saved ? "Removed from favourites." : "Saved to favourites.");
    } catch (err) {
      if (err.status === 401) return handleSessionExpired();
      showDemoNotice(err.message);
    }
  }

  // Starts a booking with the doctor's latest working days / fee (not the page-load copy)
  function startBooking(doctor) {
    if (!currentUser) {
      setShowAuth(true);
      showDemoNotice("Please log in to continue.");
    } else if (isDoctor || isAdmin) {
      showDemoNotice("Only patient accounts can book visits.");
    } else if (doctor.available) {
      setProfileDoctor(null);
      apiFetch(`/doctors/${doctor._id}`)
        .then((res) => setBookingDoctor(res.data))
        .catch(() => setBookingDoctor(doctor));
    } else {
      showDemoNotice("This doctor is currently unavailable.");
    }
  }

  function showDemoNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  function handleLogout() {
    localStorage.removeItem("mediconnect_token");
    localStorage.removeItem("mediconnect_user");
    setCurrentUser(null);
    setBookingDoctor(null);
    setShowAppointments(false);
    setShowDoctorDashboard(false);
    setShowAdmin(false);
    setReschedule(null);
    showDemoNotice("You have been logged out.");
  }

  // Called when the backend says the saved login is no longer valid
  function handleSessionExpired() {
    localStorage.removeItem("mediconnect_token");
    localStorage.removeItem("mediconnect_user");
    setCurrentUser(null);
    setBookingDoctor(null);
    setShowAppointments(false);
    setShowDoctorDashboard(false);
    setShowAdmin(false);
    setReschedule(null);
    setShowAuth(true);
    showDemoNotice("Your session expired. Please log in again.");
  }

  const isDoctor = currentUser?.role === "doctor";
  const isAdmin = currentUser?.role === "admin";
  const isPatient = Boolean(currentUser) && !isDoctor && !isAdmin;

  const specialties = [
    "All",
    ...new Set(doctors.map((doctor) => doctor.specialty).filter(Boolean)),
  ];

  const cities = [
    "All",
    ...new Set(doctors.map((doctor) => doctor.city).filter(Boolean)),
  ];

  const sorters = {
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    feeLow: (a, b) => (a.consultationFee ?? 0) - (b.consultationFee ?? 0),
    feeHigh: (a, b) => (b.consultationFee ?? 0) - (a.consultationFee ?? 0),
    experience: (a, b) => (b.experience ?? 0) - (a.experience ?? 0),
  };

  const filteredDoctors = doctors.filter((doctor) => {
    const term = search.toLowerCase();

    const matchesSearch =
      (doctor.name || "").toLowerCase().includes(term) ||
      (doctor.specialty || "").toLowerCase().includes(term);

    const matchesSpecialty =
      specialty === "All" || doctor.specialty === specialty;

    const matchesCity = city === "All" || doctor.city === city;
    const matchesFee =
      maxFee === "any" || (doctor.consultationFee ?? 0) <= Number(maxFee);

    const matchesFavorite = !onlyFavorites || favorites.includes(doctor._id);

    return matchesSearch && matchesSpecialty && matchesCity && matchesFee && matchesFavorite;
  }).sort(sorters[sortBy]);

  return (
    <div className="app-shell">
      <header className="navbar">
        <a href="#home" className="brand">
          <span className="brand-icon">
            <HeartPulse size={25} />
          </span>
          <span>MediConnect</span>
        </a>

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#doctors">Find Doctors</a>
          <a href="#about">About</a>
        </nav>

        <div className="nav-actions">
          {currentUser ? (
            <>
              {isAdmin ? (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setShowAdmin(true)}
                >
                  <ShieldIcon size={16} /> Admin panel
                </button>
              ) : isDoctor ? (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setShowDoctorDashboard(true)}
                >
                  <LayoutDashboard size={16} /> Doctor dashboard
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setShowAppointments(true)}
                >
                  <CalendarCheck size={16} /> My appointments
                </button>
              )}
              {isPatient && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setShowProfile(true)}
                >
                  <UserRound size={16} /> Profile
                </button>
              )}
              <span className="welcome-user">
                Hi, {isDoctor || isAdmin ? currentUser.name : currentUser.name.split(" ")[0]}
              </span>
              <button
                type="button"
                className="button button-outline"
                onClick={handleLogout}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setShowAuth(true)}
              >
                Log in
              </button>

              <button
                type="button"
                className="button button-primary"
                onClick={() => setShowAuth(true)}
              >
                Get started <ArrowRight size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-content">
            <div className="hero-badge">
              <HeartPulse size={16} />
              Your health, our priority
            </div>

            <h1>
              Healthcare made <span>simple.</span>
            </h1>

            <p>
              Find trusted doctors, explore specialties, and take the next
              step toward better health with MediConnect.
            </p>

            <div className="hero-actions">
              <a href="#doctors" className="button button-primary">
                Find a doctor <ArrowRight size={17} />
              </a>

              {!currentUser && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setShowAuth(true)}
                >
                  Create an account
                </button>
              )}
            </div>

            <div className="hero-stats">
              <div>
                <strong>{doctors.length}+</strong>
                <span>Listed doctors</span>
              </div>
              <div>
                <strong>24/7</strong>
                <span>Easy access</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>Patient focused</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-circle">
              <Stethoscope size={100} strokeWidth={1.3} />
            </div>

            <div className="floating-card floating-card-top">
              <span className="floating-icon">
                <ShieldCheck size={21} />
              </span>
              <div>
                <strong>Trusted care</strong>
                <small>Your health matters</small>
              </div>
            </div>

            <div className="floating-card floating-card-bottom">
              <span className="floating-icon">
                <CalendarCheck size={21} />
              </span>
              <div>
                <strong>Find your doctor</strong>
                <small>Care starts here</small>
              </div>
            </div>
          </div>
        </section>

        <section className="features" id="about">
          <div className="feature-item">
            <span className="feature-icon">
              <Search size={23} />
            </span>
            <div>
              <h3>Easy discovery</h3>
              <p>Search doctors by name or specialty.</p>
            </div>
          </div>

          <div className="feature-item">
            <span className="feature-icon">
              <ShieldCheck size={23} />
            </span>
            <div>
              <h3>Simple access</h3>
              <p>Explore doctor details in one place.</p>
            </div>
          </div>

          <div className="feature-item">
            <span className="feature-icon">
              <Users size={23} />
            </span>
            <div>
              <h3>Personal account</h3>
              <p>Create an account to get started.</p>
            </div>
          </div>
        </section>

        <section className="doctors-section" id="doctors">
          <div className="section-heading">
            <div>
              <span className="eyebrow">OUR MEDICAL PROFESSIONALS</span>
              <h2>Find the right doctor</h2>
              <p>Explore doctors available on MediConnect.</p>
            </div>

            <span className="doctor-count">
              {filteredDoctors.length} doctors
            </span>
          </div>

          <div className="doctor-controls">
            <div className="search-box">
              <Search size={19} />
              <input
                type="search"
                placeholder="Search by doctor or specialty..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <select
              aria-label="Filter by city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            >
              {cities.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All cities" : item}
                </option>
              ))}
            </select>

            <select
              aria-label="Maximum fee"
              value={maxFee}
              onChange={(event) => setMaxFee(event.target.value)}
            >
              <option value="any">Any fee</option>
              <option value="500">Up to ₹500</option>
              <option value="700">Up to ₹700</option>
              <option value="1000">Up to ₹1000</option>
            </select>

            <select
              aria-label="Sort doctors"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="rating">Top rated</option>
              <option value="feeLow">Fee: low to high</option>
              <option value="feeHigh">Fee: high to low</option>
              <option value="experience">Most experienced</option>
            </select>

            <select
              aria-label="Filter by specialty"
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
            >
              {specialties.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All specialties" : item}
                </option>
              ))}
            </select>
          </div>

          {isPatient && (
            <label className="fav-filter">
              <input
                type="checkbox"
                checked={onlyFavorites}
                onChange={(event) => setOnlyFavorites(event.target.checked)}
              />
              <Heart size={15} /> Show only my saved doctors ({favorites.length})
            </label>
          )}

          {loading && (
            <div className="empty-state">
              <p>Loading doctors from the database...</p>
            </div>
          )}

          {!loading && doctorError && (
            <div className="empty-state">
              <p>{doctorError}</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !doctorError && filteredDoctors.length === 0 && (
            <div className="empty-state">
              <Search size={30} />
              <h3>No doctors found</h3>
              <p>Try another name or specialty.</p>
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setSearch("");
                  setSpecialty("All");
                  setCity("All");
                  setMaxFee("any");
                  setOnlyFavorites(false);
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {!loading && !doctorError && filteredDoctors.length > 0 && (
            <div className="doctor-grid">
              {filteredDoctors.map((doctor) => (
                <article className="doctor-card" key={doctor._id || doctor.id}>
                  <div className="doctor-card-top">
                    <div className="doctor-avatar">
                      {doctor.image ? (
                        <img src={doctor.image} alt={doctor.name} />
                      ) : (
                        <Stethoscope size={35} />
                      )}
                    </div>

                    <div className="card-top-right">
                      <span
                        className={
                          doctor.available
                            ? "availability available"
                            : "availability unavailable"
                        }
                      >
                        {doctor.available ? "Available" : "Unavailable"}
                      </span>
                      {isPatient && (
                        <button
                          type="button"
                          className={favorites.includes(doctor._id) ? "fav-btn on" : "fav-btn"}
                          aria-pressed={favorites.includes(doctor._id)}
                          aria-label={
                            favorites.includes(doctor._id)
                              ? `Remove ${doctor.name} from favourites`
                              : `Save ${doctor.name} to favourites`
                          }
                          onClick={() => toggleFavorite(doctor)}
                        >
                          <Heart
                            size={18}
                            fill={favorites.includes(doctor._id) ? "currentColor" : "none"}
                          />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3>
                    <button
                      type="button"
                      className="name-link"
                      onClick={() => setProfileDoctor(doctor)}
                    >
                      {doctor.name}
                    </button>
                  </h3>
                  <p className="doctor-specialty">
                    {doctor.specialty || "General Physician"}
                  </p>

                  {doctor.city && (
                    <p className="doctor-city">
                      <MapPin size={14} /> {doctor.city}
                    </p>
                  )}

                  <div className="doctor-meta">
                    <button
                      type="button"
                      className="rating-link"
                      onClick={() => setProfileDoctor(doctor)}
                      aria-label={`See reviews of ${doctor.name}`}
                    >
                      <Star size={15} fill="currentColor" />
                      {doctor.rating ?? 4.5}
                      {doctor.reviewCount ? ` (${doctor.reviewCount})` : ""}
                    </button>
                    <span>
                      <Clock size={15} />
                      {doctor.experience ?? 1} years exp.
                    </span>
                  </div>

                  <div className="doctor-card-footer">
                    <div>
                      <small>Consultation fee</small>
                      <strong>₹{doctor.consultationFee ?? 500}</strong>
                    </div>

                    <button
                      type="button"
                      className="button button-primary doctor-action"
                      onClick={() => startBooking(doctor)}
                    >
                      {currentUser ? (isDoctor || isAdmin ? "Staff account" : "Book visit") : "Get started"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="cta-section">
          <div>
            <span className="eyebrow">YOUR HEALTH JOURNEY</span>
            <h2>Ready to take charge of your health?</h2>
            <p>Join MediConnect and explore available doctors.</p>
          </div>

          <button
            type="button"
            className="button button-light"
            onClick={() => {
              if (!currentUser) {
                setShowAuth(true);
              } else {
                document
                  .getElementById("doctors")
                  ?.scrollIntoView({ behavior: "smooth" });
              }
            }}
          >
            {currentUser ? "Explore doctors" : "Join MediConnect"}
            <ArrowRight size={17} />
          </button>
        </section>
      </main>

      <footer className="footer">
        <a href="#home" className="brand footer-brand">
          <span className="brand-icon">
            <HeartPulse size={22} />
          </span>
          <span>MediConnect</span>
        </a>
        <p>Making healthcare easier, one connection at a time.</p>
        <span>© {new Date().getFullYear()} MediConnect</span>
      </footer>

      {showAuth && (
        <AuthModal
          resetToken={resetToken}
          onClose={() => {
            setShowAuth(false);
            if (resetToken) {
              // done with the reset link: forget it, so the next "Log in" shows the normal form
              setResetToken("");
              window.history.replaceState({}, "", window.location.pathname);
            }
          }}
          onSuccess={(user) => {
            setCurrentUser(user);
            if (user.role === "doctor") setShowDoctorDashboard(true);
            if (user.role === "admin") setShowAdmin(true);
            showDemoNotice("Welcome to MediConnect!");
          }}
        />
      )}

      {bookingDoctor && (
        <BookingModal
          doctor={bookingDoctor}
          onClose={() => setBookingDoctor(null)}
          onBooked={showDemoNotice}
          onAuthError={handleSessionExpired}
        />
      )}

      {showAppointments && (
        <MyAppointments
          user={currentUser}
          onReschedule={async (appointment) => {
            try {
              const res = await apiFetch(`/doctors/${appointment.doctor._id}`);
              setReschedule({ appointment, doctor: res.data });
            } catch (err) {
              showDemoNotice(err.message);
            }
          }}
          onBookAgain={async (doctorId) => {
            try {
              const res = await apiFetch(`/doctors/${doctorId}`);
              setShowAppointments(false);
              startBooking(res.data);
            } catch (err) {
              showDemoNotice(err.message);
            }
          }}
          onClose={() => setShowAppointments(false)}
          onChanged={showDemoNotice}
          onAuthError={handleSessionExpired}
        />
      )}

      {reschedule && (
        <BookingModal
          doctor={reschedule.doctor}
          appointment={reschedule.appointment}
          onClose={() => setReschedule(null)}
          onBooked={(msg) => {
            showDemoNotice(msg);
            setShowAppointments(false);
            window.setTimeout(() => setShowAppointments(true), 0);
          }}
          onAuthError={handleSessionExpired}
        />
      )}

      {profileDoctor && (
        <DoctorProfile
          doctor={profileDoctor}
          onClose={() => setProfileDoctor(null)}
          onBook={isDoctor || isAdmin ? undefined : startBooking}
          isFavorite={favorites.includes(profileDoctor._id)}
          onToggleFavorite={isPatient ? toggleFavorite : undefined}
        />
      )}

      {showProfile && isPatient && (
        <MyProfile
          onClose={() => setShowProfile(false)}
          onSaved={(user, message) => {
            if (user) setCurrentUser(user);
            showDemoNotice(message);
          }}
          onAuthError={handleSessionExpired}
        />
      )}

      {showAdmin && isAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onChanged={showDemoNotice}
          onAuthError={handleSessionExpired}
        />
      )}

      {showDoctorDashboard && isDoctor && (
        <DoctorDashboard
          onClose={() => setShowDoctorDashboard(false)}
          onChanged={showDemoNotice}
          onAuthError={handleSessionExpired}
        />
      )}

      {notice && (
        <div className="demo-notice" role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}