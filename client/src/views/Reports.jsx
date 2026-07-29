import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";

function currentQuarter() {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

// "Jul 1 – Sep 30, 2026" — makes the actual reporting period unambiguous.
function quarterDateRange(year, quarter) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
}

function shiftQuarter(year, quarter, delta) {
  let q = quarter + delta;
  let y = year;
  while (q > 4) { q -= 4; y += 1; }
  while (q < 1) { q += 4; y -= 1; }
  return { year: y, quarter: q };
}

const SIGNOFF_ROLES = ["Head", "Preparer", "Member"];
function roleLabel(r) {
  if (r === "Head") return "Head of Organization";
  if (r === "Preparer") return "Report Preparer";
  return "Member in Charge";
}

export default function Reports({ permissions }) {
  const isBellJarAdmin = permissions?.moduleGrants?.["bell-jar"] === "Admin";
  const canEditInputs = !!permissions?.moduleGrants?.["bell-jar"];
  const canEditOrgProfile = permissions?.orgTier === "Owner" || isBellJarAdmin;
  const cq = currentQuarter();
  const [year, setYear] = useState(cq.year);
  const [quarter, setQuarter] = useState(cq.quarter);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloadingS1, setDownloadingS1] = useState(false);
  const [s1Error, setS1Error] = useState("");
  const [downloadingGC7Q, setDownloadingGC7Q] = useState(false);
  const [gc7qError, setGc7qError] = useState("");
  const [org, setOrg] = useState(null);
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);

  function refresh() {
    api.getGC7Q(year, quarter).then(setReport).catch(() => {});
  }
  useEffect(refresh, [year, quarter]);
  useEffect(() => { api.getOrg().then(setOrg).catch(() => {}); }, []);

  async function downloadSchedule1() {
    setDownloadingS1(true);
    setS1Error("");
    try {
      await api.downloadSchedule1Pdf(year, quarter);
    } catch (err) {
      setS1Error(err.message);
    } finally {
      setDownloadingS1(false);
    }
  }

  async function downloadGC7Q() {
    setDownloadingGC7Q(true);
    setGc7qError("");
    try {
      await api.downloadGC7QPdf(year, quarter);
    } catch (err) {
      setGc7qError(err.message);
    } finally {
      setDownloadingGC7Q(false);
    }
  }

  if (!report) return null;
  const v = report.values;
  const signedRoles = new Set((report.signOffs || []).map((s) => s.role));

  const lines = [
    { label: "Closed deals (A1)", formula: "count of deals closed in quarter", value: v.A1, isCount: true },
    { label: "Ideal Handle (A2)", formula: "Σ I of deals closed in quarter", value: v.A2 },
    { label: "Cash Prizes (A3)", formula: "Σ cash prizes", value: v.A3 },
    { label: "Unsold Value (A4)", formula: "Σ N × H", value: v.A4 },
    { label: "Ticket Purchase Costs (A5)", formula: "Σ ledger, category = ticket_purchase", value: v.A5 },
    { label: "Lines A3+A4+A5 (A6)", formula: "A3 + A4 + A5", value: v.A6 },
    { label: "Ideal Net Proceeds (A7)", formula: "A2 − A6", value: v.A7, bold: true },
    { label: "5% Additional License Fee (B8)", formula: "A7 × 0.05", value: v.B8, color: colors.warning },
    { label: "Total Net Profit (B9)", formula: "A7 − B8", value: v.B9, color: colors.success, bold: true },
    { label: "Opening Balance (C10)", formula: "prior quarter's D17", value: v.C10 },
    { label: "Interest Earned (C11)", formula: "entered manually", value: v.C11 },
    { label: "Quarterly Proceeds + Interest (C12)", formula: "C10 + C11", value: v.C12 },
    { label: "Adjustments (C13)", formula: "entered manually, requires NYS approval", value: v.C13 },
    { label: "Adjusted Proceeds (C14)", formula: "C13 + C12", value: v.C14 },
    { label: "Total Net Proceeds (C15)", formula: "B9 + C14", value: v.C15, bold: true },
    { label: "Indirect Disbursements (D16)", formula: "Σ indirect, excl. A5 & B8", value: v.D16 },
    { label: "Ending Unexpended Balance (D17)", formula: "C15 − D16", value: v.D17, color: colors.accent, bold: true },
  ];

  async function sign(role) {
    setBusy(true);
    try {
      await api.signGC7Q(year, quarter, role);
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    try {
      await api.unlockGC7Q(year, quarter);
      setConfirmingUnlock(false);
      refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  function goToQuarter(y, q) {
    setYear(y);
    setQuarter(q);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
        <button
          style={button.ghost}
          onClick={() => { const p = shiftQuarter(year, quarter, -1); goToQuarter(p.year, p.quarter); }}
        >
          ‹ Prev quarter
        </button>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Q{quarter} {year}</div>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{quarterDateRange(year, quarter)}</div>
        </div>

        <button
          style={button.ghost}
          onClick={() => { const n = shiftQuarter(year, quarter, 1); goToQuarter(n.year, n.quarter); }}
        >
          Next quarter ›
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>Jump to</span>
        <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} style={{ border: `1px solid ${colors.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 13 }}>
          {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ border: `1px solid ${colors.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 13 }}>
          {Array.from({ length: 8 }, (_, i) => cq.year - 6 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {v.zeroFiling && <span style={pill("#f0f0f3", colors.textSecondary)}>Zero-filing (no deals closed)</span>}
        <span style={pill(report.status === "filed" ? colors.successBg : "#f0f0f3", report.status === "filed" ? colors.success : colors.textSecondary)}>{report.status === "filed" ? "Filed" : "Draft"}</span>
        {report.status === "filed" && isBellJarAdmin && !confirmingUnlock && (
          <button style={button.ghost} onClick={() => setConfirmingUnlock(true)}>Unlock for correction</button>
        )}
      </div>

      {confirmingUnlock && (
        <div style={{ ...card, background: colors.warningBg, border: `1px solid ${colors.warning}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Reopen this report for correction?</div>
          <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 12 }}>
            This reverts the report to Draft and clears all 3 signatures — everyone will need to re-sign. Only do this if this report hasn't already been mailed to the Gaming Commission; if it has, correct it instead via a C13 adjustment on a later quarter.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={button.ghost} onClick={() => setConfirmingUnlock(false)}>Cancel</button>
            <button style={button.primary} onClick={unlock} disabled={busy}>{busy ? "Unlocking…" : "Yes, unlock for correction"}</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Formula ledger</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lines.map((l) => (
              <div key={l.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${colors.borderLight}`, paddingBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: l.bold ? 700 : 500 }}>{l.label}</div>
                  <div style={{ fontSize: 11, fontFamily: mono, color: colors.textTertiary }}>{l.formula}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 14, fontWeight: l.bold ? 700 : 600, color: l.color || colors.textPrimary }}>{l.isCount ? l.value : money(l.value)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {org && <OrgProfileCard org={org} canEdit={canEditOrgProfile} onSaved={setOrg} />}

          <CarryforwardCard
            year={year}
            quarter={quarter}
            report={report}
            canEdit={canEditInputs && report.status !== "filed"}
            onSaved={refresh}
          />

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Documents</div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Schedule 1 (NYS form)</div>
                <div style={{ fontSize: 11.5, color: colors.textSecondary }}>Real fillable form, stamped with this quarter's closed deals.</div>
              </div>
              <button style={button.primary} onClick={downloadSchedule1} disabled={downloadingS1}>{downloadingS1 ? "Building…" : "Download PDF"}</button>
            </div>
            {s1Error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 12 }}>{s1Error}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>GC-7Q (NYS form)</div>
                <div style={{ fontSize: 11.5, color: colors.textSecondary }}>Real fillable form. Quarter checkbox and signatures must still be marked by hand.</div>
              </div>
              <button style={button.primary} onClick={downloadGC7Q} disabled={downloadingGC7Q}>{downloadingGC7Q ? "Building…" : "Download PDF"}</button>
            </div>
            {gc7qError && <div style={{ color: colors.danger, fontSize: 12.5, marginTop: 12 }}>{gc7qError}</div>}
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Approval sign-off</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SIGNOFF_ROLES.map((r) => {
                const signed = signedRoles.has(r);
                const allowed = !!permissions?.gc7qSignerSlots?.includes(r);
                return (
                  <div key={r} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "#fafafa" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{roleLabel(r)}</span>
                    {signed ? (
                      <span style={pill(colors.successBg, colors.success)}>Signed</span>
                    ) : (
                      <button style={allowed ? button.primary : button.disabled} disabled={!allowed || busy} onClick={() => sign(r)}>Sign</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CarryforwardCard({ year, quarter, report, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    interestEarned: report.interestEarned || 0,
    adjustments: report.adjustments || 0,
    adjustmentExplanation: report.adjustmentExplanation || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updateGC7QInputs(year, quarter, form);
      onSaved();
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 12 : 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Carryforward (C11 / C13)</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Not derivable from ledger data — entered per quarter.</div>
        </div>
        {canEdit && <button style={button.ghost} onClick={() => setEditing((s) => !s)}>{editing ? "− Cancel" : "Edit"}</button>}
      </div>

      {!editing && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
          <Row2 label="Interest earned (C11)" value={money(report.interestEarned || 0)} />
          <Row2 label="Adjustments (C13)" value={money(report.adjustments || 0)} />
          {report.adjustmentExplanation && <div style={{ color: colors.textSecondary, marginTop: 4 }}>{report.adjustmentExplanation}</div>}
        </div>
      )}

      {editing && (
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Interest earned this quarter (C11)"><input style={inputStyle} type="number" step="0.01" value={form.interestEarned} onChange={(e) => set("interestEarned", e.target.value)} /></Field>
          <Field label="Adjustments (C13) — requires prior NYS approval"><input style={inputStyle} type="number" step="0.01" value={form.adjustments} onChange={(e) => set("adjustments", e.target.value)} /></Field>
          <Field label="Adjustment explanation"><input style={inputStyle} value={form.adjustmentExplanation} onChange={(e) => set("adjustmentExplanation", e.target.value)} /></Field>
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
          <button style={button.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </form>
      )}
    </div>
  );
}

function OrgProfileCard({ org, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    licenseId: org.licenseId || "",
    county: org.county || "",
    municipality: org.municipality || "",
    licenseCategory: org.licenseCategory || "",
    licenseLast5: org.licenseLast5 || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateOrg(form);
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filled = org.licenseId && org.county && org.municipality && org.licenseCategory && org.licenseLast5;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 12 : 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Form details</div>
        {canEdit && <button style={button.ghost} onClick={() => setEditing((s) => !s)}>{editing ? "− Cancel" : "Edit"}</button>}
      </div>

      {!editing && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
          <Row2 label="Games of Chance license #" value={org.licenseId} />
          <Row2 label="County" value={org.county} />
          <Row2 label="Municipality" value={org.municipality} />
          <Row2 label="License category" value={org.licenseCategory} />
          <Row2 label="GC license (last 5)" value={org.licenseLast5} />
          {!org.licenseId && <div style={{ color: colors.warning, fontSize: 11.5, marginTop: 4 }}>No license # on file yet — required to file reports, but you can add it whenever it's issued.</div>}
          {org.licenseId && !filled && <div style={{ color: colors.warning, fontSize: 11.5, marginTop: 4 }}>Incomplete — the Schedule 1 header will be blank for missing fields.</div>}
        </div>
      )}

      {editing && (
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Games of Chance license #"><input style={inputStyle} value={form.licenseId} onChange={(e) => set("licenseId", e.target.value)} placeholder="NYS-BJ-XXXX" /></Field>
          <Field label="County"><input style={inputStyle} value={form.county} onChange={(e) => set("county", e.target.value)} /></Field>
          <Field label="Municipality"><input style={inputStyle} value={form.municipality} onChange={(e) => set("municipality", e.target.value)} /></Field>
          <Field label="License category"><input style={inputStyle} value={form.licenseCategory} onChange={(e) => set("licenseCategory", e.target.value)} placeholder="Bell Jar" /></Field>
          <Field label="GC license (last 5 digits)"><input style={inputStyle} value={form.licenseLast5} onChange={(e) => set("licenseLast5", e.target.value)} maxLength={5} /></Field>
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
          <button style={button.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </form>
      )}
    </div>
  );
}

function Row2({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: colors.textSecondary }}>{label}</span>
      <span style={{ fontFamily: mono, color: value ? colors.textPrimary : colors.textTertiary }}>{value || "—"}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
