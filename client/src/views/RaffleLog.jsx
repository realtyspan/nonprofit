import React, { useEffect, useState } from "react";
import { colors, card, pill } from "../lib/tokens";
import { api } from "../lib/api";

const TYPE_LABEL = {
  sold: "Sold",
  reserved: "Reserved",
  funds_received: "Funds received",
  released: "Released",
  reassigned: "Reassigned",
  drawing: "Drawing",
  checkin: "Check-in",
  reminder_sent: "Reminder sent",
  email_sent: "Email sent",
  game_started: "Raffle started",
  game_edited: "Raffle edited",
  game_closed: "Raffle closed",
  game_reopened: "Raffle reopened",
  expense_added: "Expense added",
  expense_deleted: "Expense removed",
  estimated_expenses_updated: "Estimated expenses updated",
  renewal_call_logged: "Renewal call",
};

const TYPE_COLOR = {
  sold: [colors.indigoBg, colors.indigo],
  reserved: [colors.warningBg, colors.warning],
  funds_received: [colors.successBg, colors.success],
  released: ["#f0f0f3", colors.textSecondary],
  reassigned: ["#f0f0f3", colors.textSecondary],
  drawing: ["#fdeee0", "#b45309"],
  checkin: [colors.successBg, colors.success],
  reminder_sent: [colors.warningBg, colors.warning],
  email_sent: [colors.indigoBg, colors.indigo],
  game_started: [colors.successBg, colors.success],
  game_edited: [colors.indigoBg, colors.indigo],
  game_closed: ["#fee2e2", colors.danger],
  game_reopened: [colors.successBg, colors.success],
  expense_added: [colors.successBg, colors.success],
  expense_deleted: ["#fee2e2", colors.danger],
  estimated_expenses_updated: [colors.warningBg, colors.warning],
  renewal_call_logged: [colors.warningBg, colors.warning],
};

export default function RaffleLog({ gameId }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!gameId) return setLogs([]);
    api.listRaffleLog(gameId).then(setLogs).catch(() => {});
  }, [gameId]);

  if (!gameId) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No raffle selected.</div>;
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Activity log</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Every ticket state change, in order.</div>
      </div>
      {logs.map((l) => {
        const [bg, text] = TYPE_COLOR[l.type] || ["#f0f0f3", colors.textSecondary];
        return (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13 }}>
            <span style={pill(bg, text)}>{TYPE_LABEL[l.type] || l.type}</span>
            <div style={{ flex: 1, minWidth: 120 }}>{l.text}</div>
            <div style={{ fontSize: 11.5, color: colors.textTertiary, whiteSpace: "nowrap" }}>{new Date(l.createdAt).toLocaleString()}</div>
          </div>
        );
      })}
      {logs.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No activity yet.</div>}
    </div>
  );
}
