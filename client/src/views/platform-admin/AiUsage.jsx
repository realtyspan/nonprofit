import React, { useEffect, useState } from "react";
import { colors, card, pill, money } from "../../lib/tokens";
import { api } from "../../lib/api";
import DataList from "../../components/DataList";

const FEATURE_LABEL = {
  "golf-historical-import-players": "Golf: historical players",
  "golf-historical-import-sponsors": "Golf: historical sponsors",
  "bell-jar-label-scan": "Bell Jar: label scan",
};

// Cross-org cost ledger for every AI-assisted feature (see server's
// aiUsage.js) — the read that decides whether a heavy user of one of these
// needs a billing conversation, not something any org can see about
// another (each org's own usage is a separate, org-scoped view on Team.jsx).
export default function AiUsage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPlatformAiUsage().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div style={{ color: colors.danger, fontSize: 13 }}>{error}</div>;
  if (!data) return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={pill(colors.successBg, colors.success)}>{money(data.platformTotalCostUsd)} all-time</span>
        <span style={pill(colors.indigoBg, colors.indigo)}>{money(data.platformLast30DaysCostUsd)} last 30 days</span>
        <span style={pill("#f1ece0", colors.textSecondary)}>{data.totalCalls} call{data.totalCalls === 1 ? "" : "s"}</span>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${colors.borderLight}`, fontSize: 15, fontWeight: 700 }}>By organization</div>
        <DataList
          rows={data.rows}
          keyField="orgId"
          emptyMessage="No AI-assisted feature has been used yet."
          columns={[
            { key: "org", label: "Organization", grid: "1.4fr", primary: true, render: (r) => r.orgName },
            { key: "calls", label: "Calls", grid: "0.8fr", render: (r) => r.totalCalls },
            { key: "last30", label: "Last 30 days", grid: "1fr", render: (r) => money(r.last30DaysCostUsd) },
            { key: "total", label: "All-time cost", grid: "1fr", render: (r) => money(r.totalCostUsd) },
            {
              key: "byFeature", label: "", footerRow: true,
              render: (r) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(r.byFeature).map(([feature, cost]) => (
                    <span key={feature} style={pill(colors.borderLight, colors.textSecondary)}>{FEATURE_LABEL[feature] || feature}: {money(cost)}</span>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
