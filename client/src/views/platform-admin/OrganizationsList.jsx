import React, { useEffect, useState } from "react";
import { colors, card, pill, money } from "../../lib/tokens";
import { api } from "../../lib/api";
import { formatUtcDate } from "../../lib/dates";
import DataList from "../../components/DataList";
import OrganizationDetail from "./OrganizationDetail";

const STATUS_STYLE = {
  trial: [colors.warningBg, colors.warning, "Trial"],
  active: [colors.successBg, colors.success, "Active"],
  past_due: ["#fee2e2", colors.danger, "Past due"],
  canceled: ["#f0f0f3", colors.textSecondary, "Canceled"],
};

export default function OrganizationsList() {
  const [summary, setSummary] = useState(null);
  const [orgs, setOrgs] = useState(null);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    api.getPlatformSummary().then(setSummary).catch((err) => setError(err.message));
    api.listPlatformOrganizations().then(setOrgs).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Organizations</div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Every organization on the platform, its billing status, and renewals coming up.</div>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          <SummaryTile label="Total orgs" value={summary.totalOrgs} />
          <SummaryTile label="Trial" value={summary.trial} color={colors.warning} />
          <SummaryTile label="Active" value={summary.active} color={colors.success} />
          <SummaryTile label="Past due" value={summary.past_due} color={colors.danger} />
          <SummaryTile label="Canceled" value={summary.canceled} color={colors.textSecondary} />
          <SummaryTile label="Renewals due (30d)" value={summary.renewalsDueSoon} color={colors.accent} />
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {orgs === null ? (
          <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>Loading…</div>
        ) : (
          <DataList
            rows={orgs}
            emptyMessage="No organizations yet."
            onRowClick={(o) => setSelectedOrgId(o.id)}
            columns={[
              { key: "name", label: "Name", grid: "1.4fr", primary: true, render: (o) => o.name },
              { key: "users", label: "Users", grid: "0.7fr", render: (o) => o.userCount },
              {
                key: "status", label: "Status", grid: "0.9fr",
                render: (o) => {
                  const [bg, text, label] = STATUS_STYLE[o.billing.status] || STATUS_STYLE.trial;
                  return <span style={pill(bg, text)}>{label}</span>;
                },
              },
              { key: "plan", label: "Plan", grid: "1.1fr", render: (o) => o.billing.planName || "—" },
              { key: "amount", label: "Amount", grid: "0.9fr", render: (o) => (o.billing.billingAmount != null ? `${money(o.billing.billingAmount)}${o.billing.billingCycle ? `/${o.billing.billingCycle}` : ""}` : "—") },
              { key: "renewal", label: "Renewal", grid: "1fr", render: (o) => (o.billing.renewalDate ? formatUtcDate(o.billing.renewalDate) : "—") },
              { key: "created", label: "Created", grid: "1fr", render: (o) => formatUtcDate(o.createdAt) },
            ]}
          />
        )}
      </div>

      {selectedOrgId && (
        <OrganizationDetail
          orgId={selectedOrgId}
          onClose={() => setSelectedOrgId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, color }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: color || colors.textPrimary }}>{value ?? 0}</div>
    </div>
  );
}
