import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatUtcDate } from "../lib/dates";
import { formatPhone } from "../lib/phone";
import DataList from "../components/DataList";
import Modal from "../components/Modal";

// Game management (start a raffle, correct its details, open/close it) — kept
// separate from Report, which is pure reporting (stats, payment reminders).
// "Report" is a strange place to find "create a new raffle," which is what
// this view exists to fix.
export default function ManageRaffles({ games, gameId, onGamesChanged }) {
  const [showNewGameForm, setShowNewGameForm] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  const [deletingGame, setDeletingGame] = useState(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [historicalImports, setHistoricalImports] = useState([]);

  const selectedGame = games.find((g) => g.id === gameId) || null;

  function refreshHistoricalImports() {
    api.listHistoricalRaffleImports().then(setHistoricalImports).catch(() => {});
  }
  useEffect(refreshHistoricalImports, []);

  async function toggleLifecycle() {
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      if (selectedGame.status === "active") await api.closeRaffleGame(gameId);
      else await api.reopenRaffleGame(gameId);
      onGamesChanged();
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setLifecycleBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {selectedGame && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {selectedGame.name} — tickets #{selectedGame.startNumber}–#{selectedGame.endNumber}
            </div>
            <span style={pill(selectedGame.status === "active" ? colors.successBg : "#f0f0f3", selectedGame.status === "active" ? colors.success : colors.textSecondary)}>
              {selectedGame.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            {selectedGame.status === "active"
              ? "Closing stops new sales, drawings, and check-ins for this raffle. Its tickets and history stay fully visible for reporting. Other raffles are unaffected."
              : "Reopening allows new sales, drawings, and check-ins for this raffle again."}
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            Buyer history source:{" "}
            {selectedGame.previousGameId
              ? [...games, ...historicalImports].find((g) => g.id === selectedGame.previousGameId)?.name || "a linked raffle"
              : <em>none linked — edit this raffle to pull past buyers from a prior one</em>}
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            Admits {selectedGame.admitsPerTicket || 1} per ticket
            {selectedGame.minimumTicketsSold ? ` · Minimum ${selectedGame.minimumTicketsSold} tickets to proceed` : ""}
            {selectedGame.eventVenue ? ` · ${selectedGame.eventVenue}` : ""}
            {selectedGame.eventDoorsOpenTime ? ` · Doors open ${selectedGame.eventDoorsOpenTime}` : ""}
          </div>
          {lifecycleError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{lifecycleError}</div>}
          <div>
            <button
              style={selectedGame.status === "active" ? { ...button.ghost, color: colors.danger } : button.primary}
              disabled={lifecycleBusy}
              onClick={toggleLifecycle}
            >
              {lifecycleBusy ? "Working…" : selectedGame.status === "active" ? "Close raffle" : "Reopen raffle"}
            </button>
          </div>
        </div>
      )}

      {selectedGame && <KickoffEmailCard game={selectedGame} />}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>All raffles</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Use the selector above to switch which one you're viewing/working in.</div>
        </div>
        <DataList
          rows={games}
          rowStyle={(g) => (g.id === gameId ? { background: "#faf9ff" } : undefined)}
          emptyMessage="No raffles yet."
          columns={[
            { key: "name", label: "Name", grid: "1.4fr", primary: true, render: (g) => g.name },
            { key: "tickets", label: "Tickets", grid: "1fr", render: (g) => `#${g.startNumber}–#${g.endNumber}` },
            { key: "price", label: "Price", grid: "1fr", render: (g) => money(g.ticketPrice) },
            { key: "dates", label: "Dates", grid: "1fr", render: (g) => <span style={{ fontSize: 12, color: colors.textSecondary }}>{formatUtcDate(g.raffleStartDate)} – {formatUtcDate(g.raffleEndDate)}</span> },
            { key: "status", label: "Status", grid: "0.6fr", render: (g) => <span style={pill(g.status === "active" ? colors.successBg : "#f0f0f3", g.status === "active" ? colors.success : colors.textSecondary)}>{g.status}</span> },
            {
              key: "actions", label: "", footerRow: true,
              render: (g) => g.status === "active" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingGame(g)}>Edit</button>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={() => setDeletingGame(g)}>Delete</button>
                </div>
              ) : null,
            },
          ]}
        />
      </div>

      {!showNewGameForm ? (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{games.length === 0 ? "Start your first raffle" : "Start another raffle"}</div>
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            Creating a new raffle never touches any other raffle — you can run more than one at the same time, each with its own ticket numbering, price, and dates.
          </div>
          <div><button style={button.primary} onClick={() => setShowNewGameForm(true)}>+ New raffle</button></div>
        </div>
      ) : (
        <NewGameForm
          games={games}
          historicalImports={historicalImports}
          onCancel={() => setShowNewGameForm(false)}
          onCreated={() => { setShowNewGameForm(false); onGamesChanged(); }}
        />
      )}

      {editingGame && (
        <EditGameModal
          game={editingGame}
          games={games}
          historicalImports={historicalImports}
          onCancel={() => setEditingGame(null)}
          onSaved={() => { setEditingGame(null); onGamesChanged(); }}
        />
      )}

      {deletingGame && (
        <DeleteRaffleModal
          game={deletingGame}
          onCancel={() => setDeletingGame(null)}
          onDeleted={() => { setDeletingGame(null); onGamesChanged(); }}
        />
      )}

      <HistoricalImports games={games} imports={historicalImports} onImportsChanged={refreshHistoricalImports} />
    </div>
  );
}

// Every other raffle (operational or historical import) an admin could point
// a raffle's "pull past buyers from" link at, newest first. Passed down as
// data rather than re-fetched per form, since the parent already holds both
// lists.
function linkableGameOptions(games, historicalImports, excludeId) {
  return [...games, ...historicalImports]
    .filter((g) => g.id !== excludeId)
    .sort((a, b) => new Date(b.raffleStartDate) - new Date(a.raffleStartDate));
}

function PreviousGameField({ options, value, onChange }) {
  if (options.length === 0) return null;
  return (
    <Field label="Pull past buyers from (optional)">
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— None —</option>
        {options.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    </Field>
  );
}

// Ticket terms + drawing-night details — kept as one block since they're all
// "what's printed on the ticket / what the buyer needs to know," separate
// from the ticket-range/price/date mechanics above.
function EventDetailsFields({ form, set }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4, borderTop: `1px solid ${colors.borderLight}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>Event details</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Admits per ticket">
          <input style={inputStyle} type="number" min="1" value={form.admitsPerTicket} onChange={(e) => set("admitsPerTicket", e.target.value)} />
        </Field>
        <Field label="Minimum tickets sold (optional)">
          <input style={inputStyle} type="number" min="0" placeholder="e.g. 300" value={form.minimumTicketsSold} onChange={(e) => set("minimumTicketsSold", e.target.value)} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Venue (optional)">
          <input style={inputStyle} placeholder="Elks Lodge, 7711 Albany Post Road, Red Hook, NY" value={form.eventVenue} onChange={(e) => set("eventVenue", e.target.value)} />
        </Field>
        <Field label="Doors open (optional)">
          <input style={inputStyle} placeholder="1:00 PM" value={form.eventDoorsOpenTime} onChange={(e) => set("eventDoorsOpenTime", e.target.value)} />
        </Field>
      </div>
      <Field label="Other event details (optional)">
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          placeholder="BBQ dinner, beer/wine/soda free, cash bar 3–5pm, drawing at 4pm…"
          value={form.eventDetails}
          onChange={(e) => set("eventDetails", e.target.value)}
        />
      </Field>
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

  useEffect(() => {
    setHtml(null); setRecipients(null); setSendResult(null); setError(""); setRecipientsError("");
  }, [game.id]);

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
            {recipients && (
              <>
                <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
                  <strong>{recipients.recipients.length}</strong> buyer{recipients.recipients.length === 1 ? "" : "s"} with an email on file across {recipients.seriesGames.length} linked raffle year{recipients.seriesGames.length === 1 ? "" : "s"}
                  {recipients.missingEmailCount > 0 ? ` (${recipients.missingEmailCount} past ticket sale${recipients.missingEmailCount === 1 ? "" : "s"} had no email on record)` : ""}.
                </div>
                {recipients.recipients.length > 0 && (
                  <>
                    <div style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${colors.borderLight}`, borderRadius: 8 }}>
                      <DataList
                        rows={recipients.recipients}
                        emptyMessage="No recipients."
                        columns={[
                          { key: "name", label: "Name", grid: "1.2fr", primary: true, render: (r) => r.name },
                          { key: "email", label: "Email", grid: "1.4fr", render: (r) => r.email },
                          { key: "phone", label: "Phone", grid: "1fr", render: (r) => formatPhone(r.phone) || "—" },
                          { key: "years", label: "Years", grid: "0.9fr", render: (r) => r.years.join(", ") },
                          { key: "seller", label: "Last seller", grid: "1fr", render: (r) => r.lastSellerName || "—" },
                        ]}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button style={button.ghost} onClick={downloadRecipientsCsv}>Export CSV</button>
                      <button style={{ ...button.primary, background: colors.danger }} onClick={() => setShowSendConfirm(true)}>
                        Send to {recipients.recipients.length}
                      </button>
                    </div>
                    {sendResult && (
                      <div style={{ fontSize: 12.5, color: colors.success }}>
                        Sent to {sendResult.sent} of {sendResult.total} recipients.
                        {sendResult.sent < sendResult.total ? ` ${sendResult.total - sendResult.sent} failed to send — check the server log for details.` : ""}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showSendConfirm && recipients && (
        <SendKickoffEmailModal
          game={game}
          recipientCount={recipients.recipients.length}
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

// Past-years sales data (ticket #, buyer, phone) uploaded once so the "past
// buyers" lookup on the ticket card has real history to show, instead of
// staying empty until the org has run a few raffles inside this app.
function HistoricalImports({ games, imports, onImportsChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editingImport, setEditingImport] = useState(null);

  async function remove(item) {
    if (!window.confirm(`Remove the imported ${item.name} data? This only deletes the archived record used for "past buyers" lookups — it has no effect on any live raffle.`)) return;
    await api.deleteHistoricalRaffleImport(item.id);
    onImportsChanged();
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Historical data</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>
          Import past years' ticket sales so a buyer's purchase history shows up on the ticket card. This is archival only — it never appears as a raffle you can sell against.
        </div>
      </div>

      {imports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {imports.map((item) => {
            const linkedTo = item.previousGameId ? [...games, ...imports].find((g) => g.id === item.previousGameId) : null;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", border: `1px solid ${colors.borderLight}`, borderRadius: 7, fontSize: 13 }}>
                <div>
                  <strong>{item.name}</strong>
                  <span style={{ color: colors.textSecondary, marginLeft: 8, fontSize: 12 }}>{item.ticketCount} ticket{item.ticketCount === 1 ? "" : "s"}</span>
                  <div style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }}>
                    Buyer history source: {linkedTo ? linkedTo.name : <em>none linked</em>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingImport(item)}>Edit</button>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={() => remove(item)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!showForm ? (
        <div><button style={button.ghost} onClick={() => setShowForm(true)}>+ Import past-years data</button></div>
      ) : (
        <HistoricalImportForm
          games={games}
          historicalImports={imports}
          onCancel={() => setShowForm(false)}
          onImported={() => { setShowForm(false); onImportsChanged(); }}
        />
      )}

      {editingImport && (
        <EditHistoricalImportModal
          item={editingImport}
          games={games}
          historicalImports={imports}
          onCancel={() => setEditingImport(null)}
          onSaved={() => { setEditingImport(null); onImportsChanged(); }}
        />
      )}
    </div>
  );
}

function EditHistoricalImportModal({ item, games, historicalImports, onCancel, onSaved }) {
  const [name, setName] = useState(item.name);
  const [previousGameId, setPreviousGameId] = useState(item.previousGameId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const linkOptions = linkableGameOptions(games, historicalImports, item.id);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updateHistoricalRaffleImport(item.id, { name: name.trim(), previousGameId: previousGameId || null });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={440} title={`Edit "${item.name}"`}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Label"><input style={inputStyle} required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <PreviousGameField options={linkOptions} value={previousGameId} onChange={setPreviousGameId} />
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

function HistoricalImportForm({ games, historicalImports, onCancel, onImported }) {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [previousGameId, setPreviousGameId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const linkOptions = linkableGameOptions(games, historicalImports, null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setError("Couldn't read that file");
    reader.onload = () => setCsv(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function submit() {
    if (!csv.trim()) return setError("Choose a CSV file first");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api.importHistoricalRaffleData({ year: Number(year), name: name.trim(), csv, previousGameId: previousGameId || null });
      setNotice(`Imported ${res.imported} ticket${res.imported === 1 ? "" : "s"}${res.skipped ? ` (${res.skipped} row${res.skipped === 1 ? "" : "s"} skipped — missing a ticket number or buyer name)` : ""}.`);
      setTimeout(onImported, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, paddingTop: 4, borderTop: `1px solid ${colors.borderLight}` }}>
      <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
        The CSV needs a <strong>Ticket Number</strong> and <strong>Buyer</strong> column. Phone, Email, Address, Seller, and Amount are optional.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Raffle year"><input style={inputStyle} type="number" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
        <Field label="Label (optional)"><input style={inputStyle} placeholder={`${year} 400 Club (imported)`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ cursor: "pointer" }}>
          <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
          <span style={{ ...button.ghost, display: "inline-block" }}>{fileName ? "Replace file" : "Choose .csv file"}</span>
        </label>
        {fileName && <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{fileName}</span>}
      </div>
      <PreviousGameField options={linkOptions} value={previousGameId} onChange={setPreviousGameId} />
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      {notice && <div style={{ color: colors.success, fontSize: 12.5 }}>{notice}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" style={button.primary} disabled={busy || !csv} onClick={submit}>{busy ? "Importing…" : "Import"}</button>
      </div>
    </div>
  );
}

function NewGameForm({ games, historicalImports, onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [endNumber, setEndNumber] = useState(400);
  const [ticketPrice, setTicketPrice] = useState(100);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [previousGameId, setPreviousGameId] = useState("");
  const [eventForm, setEventForm] = useState({ admitsPerTicket: 1, minimumTicketsSold: "", eventVenue: "", eventDoorsOpenTime: "", eventDetails: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ticketCount = Number(endNumber) - Number(startNumber) + 1;
  const linkOptions = linkableGameOptions(games, historicalImports, null);

  function setEventField(k, v) {
    setEventForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("A name is required so you can tell raffles apart");
    if (!startDate || !endDate) return setError("Start date and closing date are required");
    if (Number(endNumber) < Number(startNumber)) return setError("The ending ticket number must be at or after the starting number");
    setBusy(true);
    setError("");
    try {
      await api.createRaffleGame({
        name: name.trim(), startNumber: Number(startNumber), endNumber: Number(endNumber),
        ticketPrice: Number(ticketPrice), startDate, endDate,
        previousGameId: previousGameId || null,
        admitsPerTicket: eventForm.admitsPerTicket,
        minimumTicketsSold: eventForm.minimumTicketsSold,
        eventVenue: eventForm.eventVenue,
        eventDoorsOpenTime: eventForm.eventDoorsOpenTime,
        eventDetails: eventForm.eventDetails,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>New raffle details</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Name"><input style={inputStyle} required value={name} onChange={(e) => setName(e.target.value)} placeholder="2026 400 Club" /></Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="First ticket #"><input style={inputStyle} type="number" min="1" required value={startNumber} onChange={(e) => setStartNumber(e.target.value)} /></Field>
          <Field label="Last ticket #"><input style={inputStyle} type="number" min="1" required value={endNumber} onChange={(e) => setEndNumber(e.target.value)} /></Field>
        </div>
        {ticketCount > 0 && <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{ticketCount} ticket{ticketCount === 1 ? "" : "s"} total</div>}

        <Field label="Ticket price"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} /></Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="Raffle start date"><input style={inputStyle} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Closing date / final drawing"><input style={inputStyle} type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>

        <PreviousGameField options={linkOptions} value={previousGameId} onChange={setPreviousGameId} />

        <EventDetailsFields form={eventForm} set={setEventField} />

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Creating…" : "Start raffle"}</button>
        </div>
      </form>
    </div>
  );
}

function EditGameModal({ game, games, historicalImports, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: game.name,
    startNumber: game.startNumber,
    endNumber: game.endNumber,
    ticketPrice: game.ticketPrice,
    startDate: game.raffleStartDate.slice(0, 10),
    endDate: game.raffleEndDate.slice(0, 10),
    previousGameId: game.previousGameId || "",
    admitsPerTicket: game.admitsPerTicket || 1,
    minimumTicketsSold: game.minimumTicketsSold ?? "",
    eventVenue: game.eventVenue || "",
    eventDoorsOpenTime: game.eventDoorsOpenTime || "",
    eventDetails: game.eventDetails || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const ticketCount = Number(form.endNumber) - Number(form.startNumber) + 1;
  const rangeShrinking = Number(form.startNumber) > game.startNumber || Number(form.endNumber) < game.endNumber;
  const linkOptions = linkableGameOptions(games, historicalImports, game.id);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.updateRaffleGame(game.id, {
        name: form.name.trim(),
        startNumber: Number(form.startNumber),
        endNumber: Number(form.endNumber),
        ticketPrice: Number(form.ticketPrice),
        startDate: form.startDate,
        endDate: form.endDate,
        previousGameId: form.previousGameId || null,
        admitsPerTicket: form.admitsPerTicket,
        minimumTicketsSold: form.minimumTicketsSold,
        eventVenue: form.eventVenue,
        eventDoorsOpenTime: form.eventDoorsOpenTime,
        eventDetails: form.eventDetails,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={460} title={`Edit "${game.name}"`}>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
        Adding tickets is always safe. Shrinking the range only works if every ticket you're removing is still unsold and unreserved.
      </div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="First ticket #"><input style={inputStyle} type="number" min="1" required value={form.startNumber} onChange={(e) => set("startNumber", e.target.value)} /></Field>
          <Field label="Last ticket #"><input style={inputStyle} type="number" min="1" required value={form.endNumber} onChange={(e) => set("endNumber", e.target.value)} /></Field>
        </div>
        {ticketCount > 0 && (
          <div style={{ fontSize: 11.5, color: rangeShrinking ? colors.warningAmber : colors.textSecondary }}>
            {ticketCount} ticket{ticketCount === 1 ? "" : "s"} total{rangeShrinking ? " — shrinking from " + game.totalTickets : ""}
          </div>
        )}

        <Field label="Ticket price"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} /></Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="Raffle start date"><input style={inputStyle} type="date" required value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
          <Field label="Closing date / final drawing"><input style={inputStyle} type="date" required value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
        </div>

        <PreviousGameField options={linkOptions} value={form.previousGameId} onChange={(v) => set("previousGameId", v)} />

        <EventDetailsFields form={form} set={set} />

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteRaffleModal({ game, onCancel, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      await api.deleteRaffleGame(game.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={440} title={`Delete "${game.name}"?`}>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
        This permanently removes the raffle, all {game.totalTickets.toLocaleString()} tickets, every sale and payment recorded against them, and any drawings set up for it. This can't be undone.
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
        <button style={{ ...button.primary, background: colors.danger }} onClick={confirmDelete} disabled={busy}>
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </Modal>
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
