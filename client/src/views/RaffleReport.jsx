import React, { useEffect, useState } from "react";
import { colors, card, button, money } from "../lib/tokens";
import { api } from "../lib/api";

export default function RaffleReport({ games, gameId }) {
  const [stats, setStats] = useState(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");
  const [reportBusy, setReportBusy] = useState("");
  const [reportError, setReportError] = useState("");

  const selectedGame = games.find((g) => g.id === gameId) || null;

  async function downloadReport(kind) {
    setReportBusy(kind);
    setReportError("");
    try {
      if (kind === "seller") await api.downloadRaffleSellerActivityPdf(gameId, selectedGame.name);
      else await api.downloadRaffleTicketsTurnedInPdf(gameId, selectedGame.name);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportBusy("");
    }
  }

  function refreshStats() {
    if (!gameId) return setStats(null);
    api.getRaffleStats(gameId).then(setStats).catch(() => {});
  }
  useEffect(refreshStats, [gameId]);

  async function sendReminders() {
    setReminderBusy(true);
    setReminderError("");
    setReminderNotice("");
    try {
      const res = await api.sendRaffleReminders(gameId);
      setReminderNotice(`Sent ${res.sent} of ${res.candidates} reminder(s).`);
    } catch (err) {
      setReminderError(err.message);
    } finally {
      setReminderBusy(false);
    }
  }

  if (!selectedGame || !stats) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No raffle selected — pick one from the switcher above, or start one under Manage Raffles.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Sales and revenue</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Stat label="Total tickets" value={stats.total} />
          <Stat label="Sold or better" value={stats.sold + stats.fundsReceived} />
          <Stat label="Revenue collected" value={money(stats.revenue)} />
          <Stat label="Unsold potential" value={money(stats.available * selectedGame.ticketPrice)} />
        </div>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Available: {stats.available} · Reserved: {stats.reserved} · Sold (not yet deposited): {stats.sold} · Funds received: {stats.fundsReceived}
        </div>
      </div>

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Reports</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>Download PDF reports for record-keeping and reconciliation.</div>
        {reportError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{reportError}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button style={button.ghost} disabled={!!reportBusy} onClick={() => downloadReport("seller")}>
            {reportBusy === "seller" ? "Preparing…" : "Seller Activity Report"}
          </button>
          <button style={button.ghost} disabled={!!reportBusy} onClick={() => downloadReport("tickets")}>
            {reportBusy === "tickets" ? "Preparing…" : "Tickets Turned In Report"}
          </button>
        </div>
      </div>

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Payment reminders</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>Emails every sold or reserved ticket with an email on file that hasn't had funds received yet.</div>
        {reminderError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{reminderError}</div>}
        {reminderNotice && <div style={{ color: colors.success, fontSize: 12.5 }}>{reminderNotice}</div>}
        <div><button style={button.ghost} disabled={reminderBusy} onClick={sendReminders}>{reminderBusy ? "Sending…" : "Send reminders now"}</button></div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
