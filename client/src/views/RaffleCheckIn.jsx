import React, { useEffect, useRef, useState } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";

// Polls every 4s so multiple people checking tickets in at the door (each on
// their own device) see each other's check-ins without a manual refresh.
const POLL_MS = 4000;

export default function RaffleCheckIn({ gameId }) {
  const [checkIns, setCheckIns] = useState([]);
  const [ticketNumber, setTicketNumber] = useState("");
  const [hasGuest, setHasGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollRef = useRef(null);

  function refresh() {
    if (!gameId) return setCheckIns([]);
    api.listRaffleCheckIns(gameId).then(setCheckIns).catch(() => {});
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  async function submit(e) {
    e.preventDefault();
    if (!ticketNumber) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api.toggleRaffleCheckIn(gameId, Number(ticketNumber), hasGuest);
      setNotice(res.checkedIn ? `Ticket #${ticketNumber} checked in.` : `Ticket #${ticketNumber} check-in removed.`);
      setTicketNumber("");
      setHasGuest(false);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!gameId) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No raffle selected.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={submit} style={{ ...card, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <Field label="Ticket #">
          <input style={{ ...inputStyle, width: 100 }} autoFocus value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 8 }}>
          <input type="checkbox" checked={hasGuest} onChange={(e) => setHasGuest(e.target.checked)} />
          Bringing a guest
        </label>
        <button type="submit" style={button.primary} disabled={busy || !ticketNumber}>Check in / undo</button>
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        {notice && <div style={{ color: colors.success, fontSize: 12.5 }}>{notice}</div>}
      </form>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}`, display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Checked in ({checkIns.length})</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary }}>Updates automatically</div>
        </div>
        {checkIns.map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "0.6fr 1fr 1fr 1fr", padding: "10px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>#{c.ticketNumber}</div>
            <div>{c.hasGuest ? "+1 guest" : "—"}</div>
            <div style={{ color: colors.textSecondary }}>{c.checkedInByName}</div>
            <div style={{ fontSize: 11.5, color: colors.textTertiary }}>{new Date(c.checkedInAt).toLocaleTimeString()}</div>
          </div>
        ))}
        {checkIns.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No one checked in yet.</div>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
