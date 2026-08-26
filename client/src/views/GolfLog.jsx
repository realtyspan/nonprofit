import React, { useEffect, useState } from "react";
import { colors, card, pill } from "../lib/tokens";
import { api } from "../lib/api";

const TYPE_LABEL = {
  tournament_created: "Tournament created",
  tournament_edited: "Tournament edited",
  tournament_opened: "Tournament opened",
  tournament_closed: "Tournament closed",
  team_registered: "Team registered",
  team_edited: "Team edited",
  team_cancelled: "Team removed",
  player_added: "Player added",
  player_edited: "Player edited",
  player_removed: "Player removed",
  payment_recorded: "Payment recorded",
  checkin: "Check-in",
  sponsorship_added: "Sponsor added",
  sponsorship_payment_recorded: "Sponsor payment recorded",
  sponsorship_comped_team: "Team comped by sponsor",
  kickoff_email_sent: "Kickoff email sent",
  kickoff_email_test_sent: "Kickoff email test sent",
  sponsor_email_sent: "Sponsor email sent",
  sponsor_email_test_sent: "Sponsor email test sent",
  stripe_connected: "Stripe connected",
  stripe_disconnected: "Stripe disconnected",
};

const TYPE_COLOR = {
  tournament_created: [colors.successBg, colors.success],
  tournament_edited: [colors.indigoBg, colors.indigo],
  tournament_opened: [colors.successBg, colors.success],
  tournament_closed: ["#fee2e2", colors.danger],
  team_registered: [colors.successBg, colors.success],
  team_edited: [colors.indigoBg, colors.indigo],
  team_cancelled: ["#fee2e2", colors.danger],
  player_added: [colors.successBg, colors.success],
  player_edited: [colors.indigoBg, colors.indigo],
  player_removed: ["#fee2e2", colors.danger],
  payment_recorded: [colors.successBg, colors.success],
  checkin: [colors.successBg, colors.success],
  sponsorship_added: [colors.successBg, colors.success],
  sponsorship_payment_recorded: [colors.successBg, colors.success],
  sponsorship_comped_team: [colors.indigoBg, colors.indigo],
  kickoff_email_sent: [colors.indigoBg, colors.indigo],
  kickoff_email_test_sent: ["#f0f0f3", colors.textSecondary],
  sponsor_email_sent: [colors.indigoBg, colors.indigo],
  sponsor_email_test_sent: ["#f0f0f3", colors.textSecondary],
  stripe_connected: [colors.successBg, colors.success],
  stripe_disconnected: ["#fee2e2", colors.danger],
};

export default function GolfLog({ tournament }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!tournament) return setLogs([]);
    api.listGolfLog(tournament.id).then(setLogs).catch(() => {});
  }, [tournament?.id]);

  if (!tournament) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No tournament selected.</div>;
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Activity log</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Every registration, payment, and check-in, in order.</div>
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
