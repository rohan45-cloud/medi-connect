import { useState } from "react";
import { Video } from "lucide-react";
import { apiFetch } from "./api";

// Show the button only for upcoming, non-walk-in visits that are close in time.
// (The server decides the exact join window and answers with a clear message if it is too early.)
export function canShowVideo(a) {
  if (a.status !== "booked" || a.walkIn) return false;
  const start = new Date(a.startAt).getTime();
  const now = Date.now();
  return start - now < 24 * 3600000 && now - start < 6 * 3600000;
}

// "Video call" button. `appointment` needs _id, status, startAt, walkIn.
export default function VideoButton({ appointment, onError, onAuthError }) {
  const [busy, setBusy] = useState(false);

  if (!canShowVideo(appointment)) return null;

  async function join() {
    // open the tab right now (while the click is fresh), so the browser does not block it
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const res = await apiFetch(`/video/${appointment._id}`);
      if (tab) {
        tab.opener = null;
        tab.location.href = res.data.url;
      } else {
        window.open(res.data.url, "_blank", "noopener");
      }
    } catch (err) {
      if (tab) tab.close();
      if (err.status === 401 && onAuthError) return onAuthError();
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="button button-primary appt-cancel dash-done"
      disabled={busy}
      onClick={join}
    >
      <Video size={14} /> {busy ? "Opening..." : "Video call"}
    </button>
  );
}