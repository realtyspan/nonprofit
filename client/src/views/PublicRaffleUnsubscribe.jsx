import React, { useEffect, useState } from "react";
import { colors, card, button } from "../lib/tokens";
import { api } from "../lib/api";
import logo from "../assets/logo.png";

// Landing page for the raffle kickoff email's unsubscribe link. Reads its
// token from the query string, same as ResetPassword.jsx — works for a
// logged-out visitor with no other app state. Deliberately a two-step
// GET-info-then-POST-confirm flow, not a one-click GET action: an email
// client or security scanner that preemptively opens every link in an
// inbox could otherwise unsubscribe people who never clicked anything.
export default function PublicRaffleUnsubscribe() {
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
    api.getRaffleUnsubscribeInfo(token).then(setInfo).catch((err) => {
      setError(err.message);
      setInfo(null);
    });
  }, [token]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api.confirmRaffleUnsubscribe(token);
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
            <strong>{info.email}</strong> won't receive raffle emails from {info.orgName} anymore.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Unsubscribe from raffle emails?</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
              This stops <strong>{info.email}</strong> from receiving future raffle marketing emails from <strong>{info.orgName}</strong>. It won't affect ticket confirmations or payment receipts for a raffle you've already entered.
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
