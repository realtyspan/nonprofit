import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../../lib/tokens";
import { api } from "../../lib/api";
import { formatUtcDate } from "../../lib/dates";
import Modal from "../../components/Modal";

const STATUS_OPTIONS = [
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
];

// Same palette as OrganizationsList.jsx's STATUS_STYLE, kept local here since
// that one isn't exported.
const STATUS_PILL_COLOR = {
  trial: [colors.warningBg, colors.warning],
  active: [colors.successBg, colors.success],
  past_due: ["#fee2e2", colors.danger],
  canceled: ["#f0f0f3", colors.textSecondary],
};

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export default function OrganizationDetail({ orgId, onClose, onChanged }) {
  const [org, setOrg] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    api.getPlatformOrganization(orgId).then(setOrg).catch((err) => setError(err.message));
  }
  useEffect(refresh, [orgId]);

  function handleChanged() {
    refresh();
    onChanged();
  }

  return (
    <Modal onCancel={onClose} width={560} title={org ? org.name : "Loading…"}>
      {error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {!org ? (
        <div style={{ fontSize: 13, color: colors.textSecondary }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            Created {formatUtcDate(org.createdAt)} · {org.users.length} user{org.users.length === 1 ? "" : "s"}
            {org.contactEmail ? ` · ${org.contactEmail}` : ""}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 6 }}>Users</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {org.users.map((u) => (
                <div key={u.id} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{u.name}</span>
                  <span style={{ color: colors.textSecondary }}>{u.email}</span>
                </div>
              ))}
            </div>
          </div>

          <BillingSection orgId={org.id} billing={org.billing} onSaved={handleChanged} />
          <SupportNotes orgId={org.id} notes={org.supportNotes} onChanged={handleChanged} />

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={button.ghost} onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Stripe-managed once stripeSubscriptionId is set — the manual form becomes
// read-only at that point (the server rejects manual edits too, this is just
// keeping the UI honest about which one is live) and a billing-portal link
// takes its place. Not yet on Stripe: today's manual form, plus a way to
// start one.
function BillingSection({ orgId, billing, onSaved }) {
  if (billing.stripeSubscriptionId) {
    return <StripeSyncedBilling orgId={orgId} billing={billing} />;
  }
  return (
    <>
      <ManualBillingForm orgId={orgId} billing={billing} onSaved={onSaved} />
      <StartStripeSubscription orgId={orgId} onStarted={onSaved} />
    </>
  );
}

function StripeSyncedBilling({ orgId, billing }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portalUrl, setPortalUrl] = useState("");

  async function generatePortalLink() {
    setBusy(true);
    setError("");
    setPortalUrl("");
    try {
      const res = await api.createStripePortalLink(orgId);
      setPortalUrl(res.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Billing</div>
        <span style={pill(colors.indigoBg, colors.indigo)}>Synced from Stripe</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, fontSize: 13 }}>
        <div>
          <div style={{ color: colors.textSecondary, fontSize: 11 }}>Status</div>
          <span style={pill(...(STATUS_PILL_COLOR[billing.status] || STATUS_PILL_COLOR.trial))}>
            {STATUS_OPTIONS.find((s) => s.value === billing.status)?.label || billing.status}
          </span>
        </div>
        <div><div style={{ color: colors.textSecondary, fontSize: 11 }}>Plan</div>{billing.planName || "—"}</div>
        <div><div style={{ color: colors.textSecondary, fontSize: 11 }}>Amount</div>{billing.billingAmount != null ? `$${billing.billingAmount}${billing.billingCycle ? `/${billing.billingCycle}` : ""}` : "—"}</div>
        <div><div style={{ color: colors.textSecondary, fontSize: 11 }}>Renewal</div>{billing.renewalDate ? formatUtcDate(billing.renewalDate) : "—"}</div>
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary }}>
        This org pays through Stripe — status and dates update automatically. To change their card, cadence, or cancel, send them the billing portal link below.
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div><button style={button.ghost} disabled={busy} onClick={generatePortalLink}>{busy ? "Generating…" : "Generate billing portal link"}</button></div>
      {portalUrl && (
        <div style={{ fontSize: 12.5, wordBreak: "break-all", background: "#fafafa", border: `1px solid ${colors.borderLight}`, borderRadius: 6, padding: 10 }}>{portalUrl}</div>
      )}
    </div>
  );
}

function StartStripeSubscription({ orgId, onStarted }) {
  const [cadence, setCadence] = useState("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");

  async function generateLink() {
    setBusy(true);
    setError("");
    setCheckoutUrl("");
    try {
      const res = await api.createStripeCheckoutLink(orgId, cadence);
      setCheckoutUrl(res.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Start a Stripe subscription</div>
      <div style={{ fontSize: 12, color: colors.textSecondary }}>
        Generates a Stripe Checkout link for this org's own card details — nothing here touches your side. Copy the link and send it to them directly.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Cadence">
          <select style={inputStyle} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option value="monthly">Monthly — $39</option>
            <option value="annual">Annual — $390</option>
          </select>
        </Field>
        <button style={button.primary} disabled={busy} onClick={generateLink}>{busy ? "Generating…" : "Generate checkout link"}</button>
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      {checkoutUrl && (
        <div style={{ fontSize: 12.5, wordBreak: "break-all", background: "#fafafa", border: `1px solid ${colors.borderLight}`, borderRadius: 6, padding: 10 }}>{checkoutUrl}</div>
      )}
    </div>
  );
}

function ManualBillingForm({ orgId, billing, onSaved }) {
  const [form, setForm] = useState({
    status: billing.status,
    planName: billing.planName || "",
    billingAmount: billing.billingAmount ?? "",
    billingCycle: billing.billingCycle || "",
    renewalDate: toDateInput(billing.renewalDate),
    lastPaymentDate: toDateInput(billing.lastPaymentDate),
    notes: billing.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updatePlatformOrgBilling(orgId, form);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Billing</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="Status">
            <select style={inputStyle} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Plan name"><input style={inputStyle} placeholder="Standard Annual" value={form.planName} onChange={(e) => set("planName", e.target.value)} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="Amount"><input style={inputStyle} type="number" step="0.01" min="0" value={form.billingAmount} onChange={(e) => set("billingAmount", e.target.value)} /></Field>
          <Field label="Billing cycle">
            <select style={inputStyle} value={form.billingCycle} onChange={(e) => set("billingCycle", e.target.value)}>
              <option value="">—</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="one_time">One-time</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="Renewal date"><input style={inputStyle} type="date" value={form.renewalDate} onChange={(e) => set("renewalDate", e.target.value)} /></Field>
          <Field label="Last payment date"><input style={inputStyle} type="date" value={form.lastPaymentDate} onChange={(e) => set("lastPaymentDate", e.target.value)} /></Field>
        </div>
        <Field label="Notes">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} placeholder="Paid via check 3/1…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save billing"}</button>
          {saved && <span style={{ fontSize: 12.5, color: colors.success }}>Saved.</span>}
        </div>
      </form>
    </div>
  );
}

function SupportNotes({ orgId, notes, onChanged }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addNote(e) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.addPlatformSupportNote(orgId, { subject: subject.trim(), body: body.trim() });
      setSubject("");
      setBody("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleResolved(note) {
    try {
      await api.resolvePlatformSupportNote(orgId, note.id, note.status === "open" ? "resolved" : "open");
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Support notes</div>

      {notes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{n.subject}</div>
                <span style={pill(n.status === "open" ? colors.warningBg : colors.successBg, n.status === "open" ? colors.warning : colors.success)}>
                  {n.status === "open" ? "Open" : "Resolved"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: colors.textPrimary, marginTop: 4, whiteSpace: "pre-wrap" }}>{n.body}</div>
              <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{formatUtcDate(n.createdAt)}{n.createdByName ? ` · ${n.createdByName}` : ""}</span>
                <button type="button" style={{ ...button.ghost, padding: "3px 9px", fontSize: 11.5 }} onClick={() => toggleResolved(n)}>
                  {n.status === "open" ? "Mark resolved" : "Reopen"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addNote} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input style={inputStyle} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} placeholder="What did they call about?" value={body} onChange={(e) => setBody(e.target.value)} />
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div><button type="submit" style={button.ghost} disabled={busy}>{busy ? "Adding…" : "Add note"}</button></div>
      </form>
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
