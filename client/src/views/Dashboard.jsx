import React, { useEffect, useState } from "react";
import { colors, card, pill, money, mono } from "../lib/tokens";
import { api } from "../lib/api";

function currentQuarter() {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

export default function Dashboard({ deals, onOpenReports }) {
  const { year, quarter } = currentQuarter();
  const [report, setReport] = useState(null);

  useEffect(() => {
    api.getGC7Q(year, quarter).then(setReport).catch(() => {});
  }, [year, quarter]);

  const active = deals.filter((d) => d.status === "active");
  const eligible = active.filter((d) => d.eligibleToClose);
  const totalSold = active.reduce((s, d) => s + d.soldToDate, 0);
  const totalTickets = active.reduce((s, d) => s + d.ticketCount, 0);
  const totalPrizes = active.reduce((s, d) => s + d.prizesAwardedToDate, 0);

  const stats = [
    { label: "Active deals", value: active.length, trend: null },
    { label: "Eligible to close", value: eligible.length, trend: eligible.length > 0 ? "Action needed" : "None pending", warn: eligible.length > 0 },
    { label: "Tickets sold / total", value: `${totalSold.toLocaleString()} / ${totalTickets.toLocaleString()}`, trend: null },
    { label: "Cash prizes awarded", value: money(totalPrizes), trend: null },
  ];

  const signOffRoles = ["Head", "Preparer", "Member"];
  const signedRoles = new Set((report?.signOffs || []).map((s) => s.role));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
        {stats.map((s) => (
          <div key={s.label} style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>{s.label}</div>
            <div style={{ fontSize: typeof s.value === "string" && s.value.includes("/") ? 19 : 26, fontWeight: 800, fontFamily: mono, marginTop: 6, whiteSpace: "nowrap" }}>{s.value}</div>
            {s.trend && (
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: s.warn ? colors.warningAmber : colors.textSecondary }}>{s.trend}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Active deals &amp; prize threshold</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {active.map((d) => (
              <div key={d.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{d.name}</span>{" "}
                    <span style={{ fontSize: 11.5, fontFamily: mono, color: colors.textTertiary }}>{d.formNum}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontFamily: mono, color: colors.textSecondary }}>
                      {d.soldToDate.toLocaleString()} / {d.ticketCount.toLocaleString()} tickets
                    </span>
                    {d.eligibleToClose && <span style={pill(colors.warningBg, colors.warning)}>Eligible to close</span>}
                  </div>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: "#f0f0f3", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(d.prizePercent * 100, 100)}%`, background: d.eligibleToClose ? colors.warningAmber : colors.accent, borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 4, fontFamily: mono }}>
                  {(d.prizePercent * 100).toFixed(1)}% — {money(d.prizesAwardedToDate)} / {money(d.idealPayout)}
                </div>
              </div>
            ))}
            {active.length === 0 && <div style={{ fontSize: 13, color: colors.textSecondary }}>No active deals.</div>}
          </div>
        </div>

        <div style={{ ...card, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>GC-7Q sign-off status</div>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10 }}>Q{quarter} {year}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {signOffRoles.map((r) => {
              const signed = signedRoles.has(r);
              return (
                <div key={r} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "#fafafa" }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{roleLabel(r)}</span>
                  <span style={pill(signed ? colors.successBg : "#f0f0f3", signed ? colors.success : colors.textSecondary)}>{signed ? "Signed" : "Pending"}</span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onOpenReports}
            style={{ marginTop: "auto", textAlign: "center", background: colors.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Open GC-7Q report →
          </button>
        </div>
      </div>
    </div>
  );
}

function roleLabel(r) {
  if (r === "Head") return "Head of Organization";
  if (r === "Preparer") return "Report Preparer";
  return "Member in Charge";
}
