import React, { useEffect, useState } from "react";
import { colors, card, button } from "../lib/tokens";
import { api } from "../lib/api";
import logo from "../assets/logo.png";

// Landing page for the golf marketing email's unsubscribe link (shared by
// both the player and sponsor tracks — see GolfEmailSuppression). Mirrors
// PublicRaffleUnsubscribe.jsx exactly: reads its token from the query
// string, works for a logged-out visitor with no other app state, and is a
// deliberate two-step GET-info-then-POST-confirm flow rather than a
// one-click GET action, so an email client or security scanner that
// preemptively opens every link in an inbox can't unsubscribe someone who
// never clicked anything.
export default function PublicGolfUnsubscribe() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [info, setInfo] = useState(undefined); // undefined = loading, null = invalid
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setInfo(null);
      return;
    }
    api.getGolfUnsubscribeInfo(token).then(setInfo).catch((err) => {
      setError(err.message);
      setInfo(null);
    });
  }, [token]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api.confirmGolfUnsubscribe(token);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
      <div style={{ ...card, width: 400, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <img src={logo} alt="Charity Pulse" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>Charity Pulse</div>
        </div>

        {info === undefined ? (
          <div style={{ fontSize: 13, color: colors.textSecondary }}>Loading…</div>
        ) : info === null ? (
          <div style={{ fontSize: 13, color: colors.danger, lineHeight: 1.5 }}>
            {error || "This link is invalid or has expired."}
          </div>
        ) : done || info.alreadyUnsubscribed ? (
          <div style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 1.5 }}>
            <strong>{info.email}</strong> won't receive golf emails from {info.orgName} anymore.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Unsubscribe from golf emails?</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
              This stops <strong>{info.email}</strong> from receiving future golf tournament marketing emails from <strong>{info.orgName}</strong>. It won't affect a registration or sponsorship confirmation for a tournament you've already signed up for.
            </div>
            {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
            <button onClick={confirm} disabled={busy} style={{ ...button.primary, marginTop: 4 }}>
              {busy ? "Unsubscribing…" : "Unsubscribe me"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
