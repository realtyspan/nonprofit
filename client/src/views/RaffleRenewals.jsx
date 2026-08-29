import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import DataList from "../components/DataList";
import { useIsMobile } from "../lib/viewport";

export default function RaffleRenewals({ gameId }) {
  const isMobile = useIsMobile();
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
      <form onSubmit={logCall} style={{ ...card, display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", gap: 12, flexWrap: "wrap" }}>
        <Field label="Ticket #">
          <input style={{ ...inputStyle, width: isMobile ? "100%" : 100 }} value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Note">
          <input style={{ ...inputStyle, width: isMobile ? "100%" : 320 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Left voicemail, will call back Tuesday" />
        </Field>
        <button type="submit" style={button.primary} disabled={busy || !ticketNumber}>Log call</button>
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      </form>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Renewal calls</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Outreach calls logged for this year's raffle.</div>
        </div>
        <DataList
          rows={calls}
          emptyMessage="No calls logged yet."
          columns={[
            { key: "ticket", label: "Ticket #", grid: "0.6fr", primary: true, render: (c) => <span style={{ fontWeight: 700 }}>#{c.ticketNumber}</span> },
            { key: "note", label: "Note", grid: "1.6fr", render: (c) => <span style={{ color: colors.textSecondary }}>{c.note || "—"}</span> },
            { key: "calledBy", label: "Called by", grid: "1fr", render: (c) => c.calledByName },
            { key: "calledAt", label: "When", grid: "1fr", render: (c) => <span style={{ fontSize: 11.5, color: colors.textTertiary }}>{new Date(c.calledAt).toLocaleString()}</span> },
          ]}
        />
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
