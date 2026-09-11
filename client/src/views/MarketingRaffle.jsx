import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone } from "../lib/phone";
import { hasModuleTier } from "../lib/modules";
import DataList from "../components/DataList";
import Modal from "../components/Modal";

// Raffle's marketing tools — relocated wholesale out of ManageRaffles.jsx
// into the Marketing tab. No PublicLinkBox here: raffle has no public
// storefront page — ticket links are per-buyer, sent directly, not a page
// visitors browse. The flyer below is the one exception that needed its
// own small "where did you put this" control (see FlyerCard) since it
// still needs a QR destination even with no page of its own. Logic
// unchanged from ManageRaffles.jsx's own KickoffEmailCard/
// SendKickoffEmailModal (neither was isAdmin-gated there — any Raffle
// grant could send — preserved as-is).
export default function MarketingRaffle({ game, permissions }) {
  if (!game) {
    return (
      <div style={{ ...card, fontSize: 12.5, color: colors.textSecondary }}>
        No raffle selected — pick one from the selector above.
      </div>
    );
  }
  const isAdmin = hasModuleTier(permissions, "raffle", "Admin");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FlyerCard game={game} isAdmin={isAdmin} />
      <KickoffEmailCard game={game} />
    </div>
  );
}

// A printable, announcement-only flyer for one raffle game — same visual
// system as Golf's/Events' own flyers (see raffleFlyerPdf.js), but this one
// NEVER carries an online-payment or registration link: selling raffle or
// Bell Jar tickets online isn't permitted in New York without a Gaming
// Commission license. Raffle has no public page of its own (see the module
// comment above), so its flyer's QR needs a destination from somewhere else
// — it defaults to the org's Activities embed destination (Marketing →
// Activities), with an optional raffle-specific override here for an org
// that wants this flyer to point somewhere different.
function FlyerCard({ game, isAdmin }) {
  const [flyerBusy, setFlyerBusy] = useState(false);
  const [flyerError, setFlyerError] = useState("");
  const [destination, setDestination] = useState("");
  const [activitiesUrl, setActivitiesUrl] = useState(null);
  const [destInput, setDestInput] = useState("");
  const [destEditing, setDestEditing] = useState(false);
  const [destBusy, setDestBusy] = useState(false);
  const [destError, setDestError] = useState("");

  useEffect(() => {
    api.getOrg().then((o) => {
      setDestination(o.embedPageUrls?.raffle || "");
      setDestInput(o.embedPageUrls?.raffle || "");
      setActivitiesUrl(o.embedPageUrls?.activities || null);
    }).catch(() => {});
  }, []);

  async function downloadFlyer() {
    setFlyerBusy(true);
    setFlyerError("");
    try {
      await api.downloadRaffleFlyerPdf(game.id, game.name);
    } catch (err) {
      setFlyerError(err.message);
    } finally {
      setFlyerBusy(false);
    }
  }

  async function saveDestination() {
    setDestBusy(true);
    setDestError("");
    try {
      const updated = await api.updateOrgEmbedPageUrl("raffle", destInput.trim());
      setDestination(updated.embedPageUrls?.raffle || "");
      setActivitiesUrl(updated.embedPageUrls?.activities || null);
      setDestEditing(false);
    } catch (err) {
      setDestError(err.message);
    } finally {
      setDestBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Flyer — "{game.name}"</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>
          Price, drawing date, venue, and how to reach you — announcement only. No online payment or registration link, ever: selling raffle or Bell Jar tickets online isn't permitted in New York without a Gaming Commission license.
        </div>
      </div>
      {flyerError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{flyerError}</div>}
      <div><button style={button.secondary} disabled={flyerBusy} onClick={downloadFlyer}>{flyerBusy ? "Generating…" : "Download flyer (PDF)"}</button></div>

      <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Where did you put this?</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary }}>
          Raffle has no page of its own, so this flyer's QR code uses your Activities embed destination (Marketing → Activities) by default. Set a raffle-specific page here only if you want this one flyer to point somewhere different.
        </div>
        {destEditing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input style={{ ...inputStyle, flex: "1 1 260px" }} value={destInput} onChange={(e) => setDestInput(e.target.value)} placeholder="https://yourlodge.org/raffle" />
            <button style={button.primary} disabled={destBusy} onClick={saveDestination}>{destBusy ? "Saving…" : "Save"}</button>
            <button style={button.ghost} onClick={() => { setDestEditing(false); setDestInput(destination || ""); }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: destination ? colors.textPrimary : colors.textSecondary, fontFamily: destination ? "monospace" : undefined }}>
              {destination || (activitiesUrl ? `Using your Activities page: ${activitiesUrl}` : "Not set — will use our own Activities page")}
            </span>
            {isAdmin && <button style={button.ghost} onClick={() => setDestEditing(true)}>{destination ? "Edit" : "Set it"}</button>}
          </div>
        )}
        {destError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{destError}</div>}
      </div>
    </div>
  );
}

// Generates the season-kickoff marketing email from this raffle's own
// fields and Drawings, builds the recipient list to send it to (every
// emailed buyer across this raffle's linked history — see
// collectSeriesRecipients on the server), and can send it for real through
// the org's connected Brevo account. Sending is the one irreversible action
// here, so it's gated behind an explicit confirmation, not a single click.
function KickoffEmailCard({ game }) {
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
  }, [game.id]);

  async function sendTest(e) {
    e.preventDefault();
    setTestBusy(true);
    setTestError("");
    setTestSentTo("");
    try {
      await api.sendRaffleKickoffTestEmail(game.id, testEmail.trim());
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
      const res = await api.getRaffleKickoffEmail(game.id);
      setHtml(res.html);
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
    a.download = `${game.name.replace(/\s+/g, "_")}_Kickoff_Email.html`;
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
      setRecipients(await api.getRaffleKickoffRecipients(game.id));
    } catch (err) {
      setRecipientsError(err.message);
    } finally {
      setRecipientsBusy(false);
    }
  }

  function downloadRecipientsCsv() {
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Email", "Phone", "Years", "Last seller"].join(",");
    const rows = recipients.recipients.map((r) =>
      [r.name, r.email, r.phone, r.years.join("; "), r.lastSellerName].map(escape).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${game.name.replace(/\s+/g, "_")}_Recipients.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Marketing email</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>
          A season-kickoff email built from this raffle's price, dates, event details, and drawings, sent to past buyers from its linked raffle history through your connected Brevo account.
        </div>
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div><button style={button.ghost} disabled={busy} onClick={preview}>{busy ? "Building…" : "Preview kickoff email"}</button></div>

      {html && (
        <Modal onCancel={() => setHtml(null)} width={660} title={`${game.name} — kickoff email`}>
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
          <input
            type="email" required placeholder="you@example.com" value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />
          <button type="submit" style={button.ghost} disabled={testBusy}>{testBusy ? "Sending…" : "Send test"}</button>
        </form>
        {testError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{testError}</div>}
        {testSentTo && <div style={{ color: colors.success, fontSize: 12.5 }}>Test email sent to {testSentTo}.</div>}
      </div>

      <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Recipients</div>
        {!game.previousGameId ? (
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            This raffle isn't linked to a prior one — edit it and set "Pull past buyers from" to build a recipient list from that history.
          </div>
        ) : (
          <>
            {recipientsError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{recipientsError}</div>}
            <div><button style={button.ghost} disabled={recipientsBusy} onClick={buildRecipients}>{recipientsBusy ? "Building…" : "Build recipient list"}</button></div>
            {recipients && (() => {
              const sendable = recipients.recipients.filter((r) => !r.suppressed);
              const suppressedCount = recipients.recipients.length - sendable.length;
              return (
                <>
                  <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                    <strong>{recipients.recipients.length}</strong> buyer{recipients.recipients.length === 1 ? "" : "s"} with an email on file across {recipients.seriesGames.length} linked raffle year{recipients.seriesGames.length === 1 ? "" : "s"}
                    {recipients.missingEmailCount > 0 ? ` (${recipients.missingEmailCount} past ticket sale${recipients.missingEmailCount === 1 ? "" : "s"} had no email on record)` : ""}.
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
                            { key: "name", label: "Name", grid: "1.2fr", primary: true, render: (r) => r.name },
                            { key: "email", label: "Email", grid: "1.4fr", render: (r) => r.email },
                            { key: "phone", label: "Phone", grid: "1fr", render: (r) => formatPhone(r.phone) || "—" },
                            { key: "years", label: "Years", grid: "0.8fr", render: (r) => r.years.join(", ") },
                            { key: "seller", label: "Last seller", grid: "0.9fr", render: (r) => r.lastSellerName || "—" },
                            { key: "status", label: "", grid: "0.9fr", render: (r) => (r.suppressed ? <span style={pill("#f1ece0", colors.textSecondary)}>Unsubscribed</span> : null) },
                          ]}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button style={button.ghost} onClick={downloadRecipientsCsv}>Export CSV</button>
                        <button style={{ ...button.primary, background: colors.danger }} disabled={sendable.length === 0} onClick={() => setShowSendConfirm(true)}>
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
        <SendKickoffEmailModal
          game={game}
          recipientCount={recipients.recipients.filter((r) => !r.suppressed).length}
          onCancel={() => setShowSendConfirm(false)}
          onSent={(result) => { setShowSendConfirm(false); setSendResult(result); }}
        />
      )}
    </div>
  );
}

function SendKickoffEmailModal({ game, recipientCount, onCancel, onSent }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmSend() {
    setBusy(true);
    setError("");
    try {
      const result = await api.sendRaffleKickoffEmail(game.id);
      onSent(result);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={460} title={`Send kickoff email to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}?`}>
      <div style={{ background: colors.warningBg, border: "1px solid #F0E4A6", borderRadius: 8, padding: 12, fontSize: 13, color: "#5A4900", lineHeight: 1.5, marginBottom: 16 }}>
        <strong>This can't be undone.</strong> Once you confirm, the emails start sending immediately — there is no way to stop, pause, or recall them after this point.
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
        This sends the "{game.name}" kickoff email to {recipientCount} buyer{recipientCount === 1 ? "" : "s"} from its linked raffle history, each personalized with their own name.
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
        <button style={{ ...button.primary, background: colors.danger }} onClick={confirmSend} disabled={busy}>
          {busy ? "Sending…" : `Send to ${recipientCount}`}
        </button>
      </div>
    </Modal>
  );
}
