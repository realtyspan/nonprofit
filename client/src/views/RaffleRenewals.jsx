import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";

export default function RaffleRenewals({ gameId }) {
  const [calls, setCalls] = useState([]);
  const [ticketNumber, setTicketNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    if (!gameId) return setCalls([]);
    api.listRaffleRenewalCalls(gameId).then(setCalls).catch(() => {});
  }
  useEffect(refresh, [gameId]);

  async function logCall(e) {
    e.preventDefault();
    if (!ticketNumber) return;
    setBusy(true);
    setError("");
    try {
      await api.logRaffleRenewalCall(gameId, Number(ticketNumber), note);
      setTicketNumber("");
      setNote("");
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
      <form onSubmit={logCall} style={{ ...card, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <Field label="Ticket #">
          <input style={{ ...inputStyle, width: 100 }} value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Note">
          <input style={{ ...inputStyle, width: 320 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Left voicemail, will call back Tuesday" />
        </Field>
        <button type="submit" style={button.primary} disabled={busy || !ticketNumber}>Log call</button>
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      </form>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Renewal calls</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Outreach calls logged for this year's raffle.</div>
        </div>
        {calls.map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "0.6fr 1.6fr 1fr 1fr", padding: "10px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>#{c.ticketNumber}</div>
            <div style={{ color: colors.textSecondary }}>{c.note || "—"}</div>
            <div>{c.calledByName}</div>
            <div style={{ fontSize: 11.5, color: colors.textTertiary }}>{new Date(c.calledAt).toLocaleString()}</div>
          </div>
        ))}
        {calls.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No calls logged yet.</div>}
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
