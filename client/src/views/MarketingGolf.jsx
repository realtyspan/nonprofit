import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone } from "../lib/phone";
import { hasModuleTier } from "../lib/modules";
import DataList from "../components/DataList";
import Modal from "../components/Modal";
import PublicLinkBox from "../components/PublicLinkBox";

// Golf's marketing tools — public link/embed, flyer + brand colors,
// kickoff/sponsor marketing emails, interest-signup leads, and the "no
// active tournament" preview — relocated wholesale out of
// ManageGolfTournaments.jsx into the Marketing tab. Every card's own logic
// is unchanged; only where it lives moved. Kept fully parallel to
// MarketingTournaments.jsx (no shared components between the two), same
// as everywhere else Golf and Tournaments meet.
export default function MarketingGolf({ tournament, permissions }) {
  const isAdmin = hasModuleTier(permissions, "golf", "Admin");
  const [flyerBusy, setFlyerBusy] = useState(false);
  const [flyerError, setFlyerError] = useState("");
  const [showFlyerColors, setShowFlyerColors] = useState(false);

  async function downloadFlyer() {
    setFlyerBusy(true);
    setFlyerError("");
    try {
      await api.downloadGolfFlyerPdf(tournament.id, tournament.name);
    } catch (err) {
      setFlyerError(err.message);
    } finally {
      setFlyerBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PublicLinkBox
        basePath="golf"
        embedBasePath="golf/embed"
        embedTitle="Golf Tournament Registration"
        description="Set a link so players can view open tournaments and register a team from your website."
      />

      {tournament && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Flyer — "{tournament.name}"</div>
          {flyerError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{flyerError}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={button.secondary} disabled={flyerBusy} onClick={downloadFlyer}>
              {flyerBusy ? "Generating…" : "Download flyer (PDF)"}
            </button>
            <button style={button.ghost} onClick={() => setShowFlyerColors((s) => !s)}>{showFlyerColors ? "Hide flyer colors" : "Flyer colors"}</button>
          </div>
          {showFlyerColors && <FlyerColorsCard />}
        </div>
      )}

      <PreviewEmptyStateCard />

      {tournament && (
        <>
          <GolfKickoffEmailCard tournament={tournament} isAdmin={isAdmin} />
          <GolfSponsorEmailCard tournament={tournament} isAdmin={isAdmin} />
        </>
      )}

      <InterestSignupsCard />
    </div>
  );
}

// Org-wide (not per-tournament) — the two brand colors a generated flyer
// draws with. Deliberately separate from the embed customizer's colors
// (PublicLinkBox): those aren't even saved anywhere today, and print/web
// don't need to share one setting. Every other shade the flyer draws with
// (a light tint for badges, a guaranteed-readable dark panel fill, etc.) is
// derived from just these two at generation time — see golfFlyerPdf.js's
// deriveFlyerTheme — so an org never has to pick more than two colors.
function FlyerColorsCard() {
  const [colorsForm, setColorsForm] = useState({ primary: "", accent: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getOrg().then((o) => setColorsForm({ primary: o.flyerPrimaryColor || "", accent: o.flyerAccentColor || "" })).catch(() => {});
  }, []);

  function set(k, v) {
    setColorsForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.updateFlyerColors(colorsForm.primary || null, colorsForm.accent || null);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // A blank field already means "use the app's default" (see save() above),
  // so resetting just clears both fields and saves that right away — most
  // people who've messed up their colors don't have the original hex codes
  // memorized to type back in, so this needs to be a single click, not
  // "clear the fields, then remember to also hit Save."
  async function reset() {
    setBusy(true);
    setError("");
    try {
      await api.updateFlyerColors(null, null);
      setColorsForm({ primary: "", accent: "" });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isDefault = !colorsForm.primary && !colorsForm.accent;

  return (
    <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11.5, color: colors.textSecondary }}>
        Match your flyer to your own colors — paste a hex code if you have one, or click the swatch to pick. Leave either blank to use the app's default colors.
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <ColorField label="Primary (panels)" value={colorsForm.primary} onChange={(v) => set("primary", v)} placeholder="#25555f" />
        <ColorField label="Accent (highlights)" value={colorsForm.accent} onChange={(v) => set("accent", v)} placeholder="#cd715c" />
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={button.primary} disabled={busy} onClick={save}>{busy ? "Saving…" : saved ? "Saved!" : "Save colors"}</button>
        <button style={button.ghost} disabled={busy || isDefault} onClick={reset}>Reset to defaults</button>
      </div>
    </div>
  );
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function ColorField({ label, value, onChange, placeholder }) {
  const swatchValue = HEX_COLOR_RE.test(value) ? value : placeholder;
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: colors.textSecondary }}>
      {label}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={swatchValue}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 34, height: 30, padding: 0, border: `1px solid ${colors.border}`, borderRadius: 6, cursor: "pointer", background: "none" }}
        />
        <input style={{ ...inputStyle, width: 100 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </label>
  );
}

// Invites this tournament's linked history of past players back — the
// payoff of setting "Player/sponsor history source" on a tournament (or
// "Marketing history source" on a historical import). Mirrors
// ManageRaffles.jsx's KickoffEmailCard/SendKickoffEmailModal almost
// exactly; sending is the one irreversible action here, so it's gated
// behind an explicit confirmation, not a single click. `isAdmin` gating
// matches every other admin-only action here — the server enforces Admin
// regardless (see golf.js), this is just so someone without it isn't
// surprised by a 403 after filling in a test email.
function GolfKickoffEmailCard({ tournament, isAdmin }) {
  const [html, setHtml] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipients, setRecipients] = useState(null);
  const [recipientsBusy, setRecipientsBusy] = useState(false);
  const [recipientsError, setRecipientsError] = useState("");
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [testEmail, setTestEmail] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState("");
  const [testSentTo, setTestSentTo] = useState("");

  useEffect(() => {
    setHtml(null); setRecipients(null); setSendResult(null); setError(""); setRecipientsError("");
    setTestEmail(""); setTestError(""); setTestSentTo("");
  }, [tournament.id]);

  async function sendTest(e) {
    e.preventDefault();
    setTestBusy(true);
    setTestError("");
    setTestSentTo("");
    try {
      await api.sendGolfKickoffTestEmail(tournament.id, testEmail.trim());
      setTestSentTo(testEmail.trim());
    } catch (err) {
      setTestError(err.message);
    } finally {
      setTestBusy(false);
    }
  }

  async function preview() {
    setBusy(true);
    setError("");
    try {
      setHtml((await api.getGolfKickoffEmail(tournament.id)).html);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tournament.name.replace(/\s+/g, "_")}_Kickoff_Email.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function buildRecipients() {
    setRecipientsBusy(true);
    setRecipientsError("");
    setSendResult(null);
    try {
      setRecipients(await api.getGolfKickoffRecipients(tournament.id));
    } catch (err) {
      setRecipientsError(err.message);
    } finally {
      setRecipientsBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Player marketing email</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>
          Invites past players back for "{tournament.name}", sent to everyone who played in its linked tournament history.
        </div>
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div><button style={isAdmin ? button.ghost : button.disabled} disabled={busy || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can preview marketing email" : ""} onClick={preview}>{busy ? "Building…" : "Preview email"}</button></div>

      {html && (
        <Modal onCancel={() => setHtml(null)} width={660} title={`${tournament.name} — player email`}>
          <iframe title="Kickoff email preview" srcDoc={html} style={{ width: "100%", height: "65vh", border: `1px solid ${colors.borderLight}`, borderRadius: 8 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button style={button.ghost} onClick={() => setHtml(null)}>Close</button>
            <button style={button.primary} onClick={download}>Download HTML</button>
          </div>
        </Modal>
      )}

      <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Send yourself a test</div>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Sends one real copy to an address you choose, marked [TEST] in the subject line. It doesn't count against or affect the real recipient list below.
        </div>
        <form onSubmit={sendTest} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="email" required placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} style={{ ...inputStyle, flex: "1 1 220px" }} disabled={!isAdmin} />
          <button type="submit" style={isAdmin ? button.ghost : button.disabled} disabled={testBusy || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can send marketing email" : ""}>{testBusy ? "Sending…" : "Send test"}</button>
        </form>
        {testError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{testError}</div>}
        {testSentTo && <div style={{ color: colors.success, fontSize: 12.5 }}>Test email sent to {testSentTo}.</div>}
      </div>

      <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Recipients</div>
        {!tournament.previousTournamentId ? (
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            This tournament isn't linked to a prior one — edit it and set "Player/sponsor history source" to build a recipient list from that history.
          </div>
        ) : (
          <>
            {recipientsError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{recipientsError}</div>}
            <div><button style={isAdmin ? button.ghost : button.disabled} disabled={recipientsBusy || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can build a recipient list" : ""} onClick={buildRecipients}>{recipientsBusy ? "Building…" : "Build recipient list"}</button></div>
            {recipients && (() => {
              const sendable = recipients.recipients.filter((r) => !r.suppressed);
              const suppressedCount = recipients.recipients.length - sendable.length;
              return (
                <>
                  <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                    <strong>{recipients.recipients.length}</strong> player{recipients.recipients.length === 1 ? "" : "s"} with an email on file across {recipients.seriesYears.length} linked tournament year{recipients.seriesYears.length === 1 ? "" : "s"}
                    {recipients.missingEmailCount > 0 ? ` (${recipients.missingEmailCount} past roster entr${recipients.missingEmailCount === 1 ? "y" : "ies"} had no email on record)` : ""}.
                    {suppressedCount > 0 ? ` ${suppressedCount} of those unsubscribed and won't be emailed.` : ""}
                  </div>
                  {recipients.recipients.length > 0 && (
                    <>
                      <div style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${colors.borderLight}`, borderRadius: 8 }}>
                        <DataList
                          rows={recipients.recipients}
                          emptyMessage="No recipients."
                          rowStyle={(r) => (r.suppressed ? { opacity: 0.55 } : undefined)}
                          columns={[
                            { key: "name", label: "Name", grid: "1.3fr", primary: true, render: (r) => r.name },
                            { key: "email", label: "Email", grid: "1.5fr", render: (r) => r.email },
                            { key: "phone", label: "Phone", grid: "1fr", render: (r) => formatPhone(r.phone) || "—" },
                            { key: "years", label: "Years", grid: "0.8fr", render: (r) => r.years.join(", ") },
                            { key: "status", label: "", grid: "0.9fr", render: (r) => (r.suppressed ? <span style={pill("#f1ece0", colors.textSecondary)}>Unsubscribed</span> : null) },
                          ]}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button style={{ ...button.primary, background: colors.danger }} disabled={sendable.length === 0 || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can send marketing email" : ""} onClick={() => setShowSendConfirm(true)}>
                          Send to {sendable.length}
                        </button>
                      </div>
                      {sendResult && (
                        <div style={{ fontSize: 12.5, color: colors.success }}>
                          Sent to {sendResult.sent} of {sendResult.total} recipients.
                          {sendResult.sent < sendResult.total ? ` ${sendResult.total - sendResult.sent} failed to send — check the server log for details.` : ""}
                          {sendResult.suppressed > 0 ? ` ${sendResult.suppressed} skipped — unsubscribed.` : ""}
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      {showSendConfirm && recipients && (
        <SendGolfMarketingEmailModal
          title={`Send player email to ${recipients.recipients.filter((r) => !r.suppressed).length} recipient${recipients.recipients.filter((r) => !r.suppressed).length === 1 ? "" : "s"}?`}
          description={`This sends the "${tournament.name}" player email to ${recipients.recipients.filter((r) => !r.suppressed).length} past player${recipients.recipients.filter((r) => !r.suppressed).length === 1 ? "" : "s"} from its linked tournament history, each personalized with their own name.`}
          send={() => api.sendGolfKickoffEmail(tournament.id)}
          onCancel={() => setShowSendConfirm(false)}
          onSent={(result) => { setShowSendConfirm(false); setSendResult(result); }}
        />
      )}
    </div>
  );
}

// Invites this tournament's linked history of past sponsors back — same
// mechanics as GolfKickoffEmailCard, over confirmed sponsorships instead
// of rosters.
function GolfSponsorEmailCard({ tournament, isAdmin }) {
  const [html, setHtml] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipients, setRecipients] = useState(null);
  const [recipientsBusy, setRecipientsBusy] = useState(false);
  const [recipientsError, setRecipientsError] = useState("");
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [testEmail, setTestEmail] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState("");
  const [testSentTo, setTestSentTo] = useState("");

  useEffect(() => {
    setHtml(null); setRecipients(null); setSendResult(null); setError(""); setRecipientsError("");
    setTestEmail(""); setTestError(""); setTestSentTo("");
  }, [tournament.id]);

  async function sendTest(e) {
    e.preventDefault();
    setTestBusy(true);
    setTestError("");
    setTestSentTo("");
    try {
      await api.sendGolfSponsorTestEmail(tournament.id, testEmail.trim());
      setTestSentTo(testEmail.trim());
    } catch (err) {
      setTestError(err.message);
    } finally {
      setTestBusy(false);
    }
  }

  async function preview() {
    setBusy(true);
    setError("");
    try {
      setHtml((await api.getGolfSponsorEmail(tournament.id)).html);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tournament.name.replace(/\s+/g, "_")}_Sponsor_Email.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function buildRecipients() {
    setRecipientsBusy(true);
    setRecipientsError("");
    setSendResult(null);
    try {
      setRecipients(await api.getGolfSponsorEmailRecipients(tournament.id));
    } catch (err) {
      setRecipientsError(err.message);
    } finally {
      setRecipientsBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Sponsor marketing email</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>
          Invites past sponsors back for "{tournament.name}", sent to every confirmed sponsor across its linked tournament history.
        </div>
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div><button style={isAdmin ? button.ghost : button.disabled} disabled={busy || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can preview marketing email" : ""} onClick={preview}>{busy ? "Building…" : "Preview email"}</button></div>

      {html && (
        <Modal onCancel={() => setHtml(null)} width={660} title={`${tournament.name} — sponsor email`}>
          <iframe title="Sponsor email preview" srcDoc={html} style={{ width: "100%", height: "65vh", border: `1px solid ${colors.borderLight}`, borderRadius: 8 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button style={button.ghost} onClick={() => setHtml(null)}>Close</button>
            <button style={button.primary} onClick={download}>Download HTML</button>
          </div>
        </Modal>
      )}

      <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Send yourself a test</div>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Sends one real copy to an address you choose, marked [TEST] in the subject line. It doesn't count against or affect the real recipient list below.
        </div>
        <form onSubmit={sendTest} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="email" required placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} style={{ ...inputStyle, flex: "1 1 220px" }} disabled={!isAdmin} />
          <button type="submit" style={isAdmin ? button.ghost : button.disabled} disabled={testBusy || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can send marketing email" : ""}>{testBusy ? "Sending…" : "Send test"}</button>
        </form>
        {testError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{testError}</div>}
        {testSentTo && <div style={{ color: colors.success, fontSize: 12.5 }}>Test email sent to {testSentTo}.</div>}
      </div>

      <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Recipients</div>
        {!tournament.previousTournamentId ? (
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            This tournament isn't linked to a prior one — edit it and set "Player/sponsor history source" to build a recipient list from that history.
          </div>
        ) : (
          <>
            {recipientsError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{recipientsError}</div>}
            <div><button style={isAdmin ? button.ghost : button.disabled} disabled={recipientsBusy || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can build a recipient list" : ""} onClick={buildRecipients}>{recipientsBusy ? "Building…" : "Build recipient list"}</button></div>
            {recipients && (() => {
              const sendable = recipients.recipients.filter((r) => !r.suppressed);
              const suppressedCount = recipients.recipients.length - sendable.length;
              return (
                <>
                  <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                    <strong>{recipients.recipients.length}</strong> sponsor{recipients.recipients.length === 1 ? "" : "s"} with an email on file across {recipients.seriesYears.length} linked tournament year{recipients.seriesYears.length === 1 ? "" : "s"}
                    {recipients.missingEmailCount > 0 ? ` (${recipients.missingEmailCount} past sponsorship${recipients.missingEmailCount === 1 ? "" : "s"} had no email on record)` : ""}.
                    {suppressedCount > 0 ? ` ${suppressedCount} of those unsubscribed and won't be emailed.` : ""}
                  </div>
                  {recipients.recipients.length > 0 && (
                    <>
                      <div style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${colors.borderLight}`, borderRadius: 8 }}>
                        <DataList
                          rows={recipients.recipients}
                          emptyMessage="No recipients."
                          rowStyle={(r) => (r.suppressed ? { opacity: 0.55 } : undefined)}
                          columns={[
                            { key: "name", label: "Contact", grid: "1.2fr", primary: true, render: (r) => r.name },
                            { key: "company", label: "Company", grid: "1.2fr", render: (r) => r.companyName },
                            { key: "email", label: "Email", grid: "1.4fr", render: (r) => r.email },
                            { key: "years", label: "Years", grid: "0.7fr", render: (r) => r.years.join(", ") },
                            { key: "tier", label: "Last tier", grid: "0.9fr", render: (r) => r.lastTierName || "—" },
                            { key: "status", label: "", grid: "0.9fr", render: (r) => (r.suppressed ? <span style={pill("#f1ece0", colors.textSecondary)}>Unsubscribed</span> : null) },
                          ]}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button style={{ ...button.primary, background: colors.danger }} disabled={sendable.length === 0 || !isAdmin} title={!isAdmin ? "Only a Golf Tournament Admin can send marketing email" : ""} onClick={() => setShowSendConfirm(true)}>
                          Send to {sendable.length}
                        </button>
                      </div>
                      {sendResult && (
                        <div style={{ fontSize: 12.5, color: colors.success }}>
                          Sent to {sendResult.sent} of {sendResult.total} recipients.
                          {sendResult.sent < sendResult.total ? ` ${sendResult.total - sendResult.sent} failed to send — check the server log for details.` : ""}
                          {sendResult.suppressed > 0 ? ` ${sendResult.suppressed} skipped — unsubscribed.` : ""}
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      {showSendConfirm && recipients && (
        <SendGolfMarketingEmailModal
          title={`Send sponsor email to ${recipients.recipients.filter((r) => !r.suppressed).length} recipient${recipients.recipients.filter((r) => !r.suppressed).length === 1 ? "" : "s"}?`}
          description={`This sends the "${tournament.name}" sponsor email to ${recipients.recipients.filter((r) => !r.suppressed).length} past sponsor${recipients.recipients.filter((r) => !r.suppressed).length === 1 ? "" : "s"} from its linked tournament history.`}
          send={() => api.sendGolfSponsorEmail(tournament.id)}
          onCancel={() => setShowSendConfirm(false)}
          onSent={(result) => { setShowSendConfirm(false); setSendResult(result); }}
        />
      )}
    </div>
  );
}

// Shared confirm-and-send modal for both marketing email tracks above —
// the `send` prop is the one difference between them.
function SendGolfMarketingEmailModal({ title, description, send, onCancel, onSent }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmSend() {
    setBusy(true);
    setError("");
    try {
      onSent(await send());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={460} title={title}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>{description} This can't be undone.</div>
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button style={{ ...button.primary, background: colors.danger }} onClick={confirmSend} disabled={busy}>{busy ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </Modal>
  );
}

// Lets an admin see exactly what a visitor sees when no tournament is open
// for registration — reusing PublicGolf.jsx's real preview-tournament/
// "Notify Me" layout — without having to close or delete a real, currently
// open tournament just to check. `?preview=empty` (recognized by
// PublicGolf.jsx) forces that view using whatever real tournament data is
// available, and disables the Notify Me form's actual submission so trying
// it out never leaves a fake entry in the real Interest Signups list below.
function PreviewEmptyStateCard() {
  const [slug, setSlug] = useState("");

  useEffect(() => {
    api.getOrg().then((o) => setSlug(o.slug || "")).catch(() => {});
  }, []);

  if (!slug) return null;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>Preview "no active tournament" page</div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
        See exactly what visitors see when no tournament is open for registration, using your own tournament's details — without changing anything or touching a real tournament's status.
      </div>
      <div>
        <a href={`/golf/${slug}?preview=empty`} target="_blank" rel="noreferrer" style={{ ...button.secondary, textDecoration: "none", display: "inline-block" }}>
          Open preview ↗
        </a>
      </div>
    </div>
  );
}

// Org-wide (not per-tournament) — leads captured from the public golf
// page's "Notify Me" form while no tournament was open for registration
// (see PublicGolf.jsx's PreviewTournamentCard / NotifyForm). A signup can
// exist before any tournament does, so this isn't scoped to `tournament`.
function InterestSignupsCard() {
  const [signups, setSignups] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  function reload() {
    api.listGolfInterestSignups().then(setSignups).catch((err) => setError(err.message));
  }
  useEffect(reload, []);

  async function toggleContacted(signup) {
    setBusyId(signup.id);
    setError("");
    try {
      const updated = await api.setGolfInterestSignupContacted(signup.id, !signup.contactedAt);
      setSignups((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Interest signups</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>
          People who asked to be notified when your next tournament opens for registration.
        </div>
        {error && <div style={{ color: colors.danger, fontSize: 12.5, marginTop: 6 }}>{error}</div>}
      </div>
      <DataList
        rows={signups}
        emptyMessage="No one has signed up for a notification yet."
        columns={[
          { key: "name", label: "Name", grid: "1.2fr", primary: true, render: (s) => s.name },
          { key: "role", label: "Interested as", grid: "0.9fr", render: (s) => (s.role === "sponsor" ? "Sponsor" : "Player") },
          {
            key: "contact", label: "Contact", grid: "1.4fr",
            render: (s) => [s.email, s.phone && formatPhone(s.phone)].filter(Boolean).join(" · ") || "—",
          },
          { key: "companyName", label: "Company", grid: "1fr", render: (s) => s.companyName || "—" },
          { key: "submitted", label: "Submitted", grid: "1fr", render: (s) => new Date(s.createdAt).toLocaleString() },
          {
            key: "actions", label: "", footerRow: true,
            render: (s) => (
              <button
                style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: s.contactedAt ? colors.textSecondary : undefined }}
                disabled={busyId === s.id}
                onClick={() => toggleContacted(s)}
              >
                {busyId === s.id ? "Working…" : s.contactedAt ? "Contacted ✓" : "Mark contacted"}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}
