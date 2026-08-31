import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatUtcDate } from "../lib/dates";
import { resizeImageFile } from "../lib/imageResize";
import { formatPhone, stripPhone } from "../lib/phone";
import DataList from "../components/DataList";
import Modal from "../components/Modal";
import PublicLinkBox from "../components/PublicLinkBox";
import { useConfirm } from "../lib/ConfirmContext";

// Tournament management (start a tournament, correct its details, open/close
// it) — mirrors ManageRaffles.jsx's game-management pattern. Roster, sponsors,
// check-in, and marketing email are separate views/build steps; this screen
// is scoped to the tournament record itself.
export default function ManageGolfTournaments({ tournaments, tournamentId, onTournamentsChanged }) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [deletingTournament, setDeletingTournament] = useState(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [historicalImports, setHistoricalImports] = useState([]);

  function refreshHistoricalImports() {
    api.listGolfHistoricalImports().then(setHistoricalImports).catch(() => {});
  }
  useEffect(refreshHistoricalImports, []);

  const selected = tournaments.find((t) => t.id === tournamentId) || null;

  async function toggleLifecycle() {
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      if (selected.status === "open") await api.closeGolfTournament(tournamentId);
      else if (selected.status === "closed") await api.reopenGolfTournament(tournamentId);
      else await api.openGolfTournament(tournamentId);
      onTournamentsChanged();
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setLifecycleBusy(false);
    }
  }

  const lifecycleLabel = selected?.status === "open" ? "Close tournament" : selected?.status === "closed" ? "Reopen tournament" : "Open for registration";
  const statusStyle = (status) =>
    status === "open" ? [colors.successBg, colors.success] : status === "closed" ? ["#f1ece0", colors.textSecondary] : [colors.warningBg, colors.warning];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {selected && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {selected.name} — {formatUtcDate(selected.date)}
            </div>
            <span style={pill(...statusStyle(selected.status))}>{selected.status}</span>
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            {selected.status === "open"
              ? "Closing stops new registrations and payments. Its roster and history stay fully visible for reporting."
              : selected.status === "closed"
              ? "Reopening allows new registrations and payments for this tournament again."
              : "Not visible to the public yet — open it once the details below are ready."}
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            {money(selected.costPerPlayer)}/player · {selected.maxTeamSize}-person teams
            {selected.capacity ? ` · ${selected.registeredTeamCount}/${selected.capacity} teams registered` : ` · ${selected.registeredTeamCount} team${selected.registeredTeamCount === 1 ? "" : "s"} registered`}
            {selected.venueName ? ` · ${selected.venueName}` : ""}
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            Player/sponsor history source:{" "}
            {selected.previousTournamentId
              ? tournaments.find((t) => t.id === selected.previousTournamentId)?.name || "a linked tournament"
              : <em>none linked — edit this tournament to pull past players/sponsors from a prior one</em>}
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            Payment options: {[
              selected.allowCheckPayment && "mail a check",
              selected.allowInPersonPayment && "pay in person",
            ].filter(Boolean).join(", ") || "none enabled yet"}
          </div>
          {lifecycleError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{lifecycleError}</div>}
          <div>
            <button
              style={selected.status === "open" ? { ...button.ghost, color: colors.danger } : button.primary}
              disabled={lifecycleBusy}
              onClick={toggleLifecycle}
            >
              {lifecycleBusy ? "Working…" : lifecycleLabel}
            </button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>All tournaments</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Use the selector above to switch which one you're viewing/working in.</div>
        </div>
        <DataList
          rows={tournaments}
          rowStyle={(t) => (t.id === tournamentId ? { background: colors.accentSoft } : undefined)}
          emptyMessage="No tournaments yet."
          columns={[
            { key: "name", label: "Name", grid: "1.4fr", primary: true, render: (t) => t.name },
            { key: "date", label: "Date", grid: "1fr", render: (t) => formatUtcDate(t.date) },
            { key: "cost", label: "Cost/player", grid: "1fr", render: (t) => money(t.costPerPlayer) },
            { key: "teams", label: "Teams", grid: "1fr", render: (t) => (t.capacity ? `${t.registeredTeamCount}/${t.capacity}` : `${t.registeredTeamCount}`) },
            { key: "status", label: "Status", grid: "0.7fr", render: (t) => <span style={pill(...statusStyle(t.status))}>{t.status}</span> },
            {
              key: "actions", label: "", footerRow: true,
              render: (t) => t.status !== "closed" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingTournament(t)}>Edit</button>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={() => setDeletingTournament(t)}>Delete</button>
                </div>
              ) : null,
            },
          ]}
        />
      </div>

      {!showNewForm ? (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{tournaments.length === 0 ? "Start your first tournament" : "Start another tournament"}</div>
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            Creating a new tournament never touches any other tournament — you can run more than one, each with its own roster, pricing, and dates.
          </div>
          <div><button style={button.primary} onClick={() => setShowNewForm(true)}>+ New tournament</button></div>
        </div>
      ) : (
        <TournamentForm
          tournaments={tournaments}
          historicalImports={historicalImports}
          onCancel={() => setShowNewForm(false)}
          onSaved={() => { setShowNewForm(false); onTournamentsChanged(); }}
        />
      )}

      {editingTournament && (
        <TournamentForm
          tournament={editingTournament}
          tournaments={tournaments}
          historicalImports={historicalImports}
          onCancel={() => setEditingTournament(null)}
          onSaved={() => { setEditingTournament(null); onTournamentsChanged(); }}
          modal
        />
      )}

      {deletingTournament && (
        <DeleteTournamentModal
          tournament={deletingTournament}
          onCancel={() => setDeletingTournament(null)}
          onDeleted={() => { setDeletingTournament(null); onTournamentsChanged(); }}
        />
      )}

      <PublicLinkBox
        basePath="golf"
        embedBasePath="golf/embed"
        embedTitle="Golf Tournament Registration"
        description="Set a link so players can view open tournaments and register a team from your website."
      />

      <StripeConnectCard />

      <HistoricalImports tournaments={tournaments} imports={historicalImports} onImportsChanged={refreshHistoricalImports} />
    </div>
  );
}

// Org-wide (not per-tournament) — one connected Stripe account covers every
// tournament this org ever runs. Express account + direct charges, so the
// connected account (not this platform) is the merchant of record; see plan
// doc for why. Onboarding happens on Stripe's own hosted page — clicking
// "Connect Stripe" redirects there immediately rather than copy-pasting a
// link, since the org admin is the one clicking through, not someone else.
function StripeConnectCard() {
  const [connect, setConnect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();

  function reload() {
    api.getGolfStripeConnect().then(setConnect).catch((err) => setError(err.message));
  }

  useEffect(reload, []);

  async function startOnboarding() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api.onboardGolfStripeConnect();
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    setError("");
    try {
      setConnect(await api.syncGolfStripeConnect());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!(await confirm("Disconnect Stripe? Online payment will stop appearing as an option until it's reconnected.", { confirmLabel: "Disconnect" }))) return;
    setBusy(true);
    setError("");
    try {
      await api.disconnectGolfStripeConnect();
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!connect) return null;

  const connected = connect.chargesEnabled;
  const startedNotFinished = connect.stripeAccountId && !connect.chargesEnabled;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Online payment settings</div>
        <span style={pill(...(connected ? [colors.successBg, colors.success] : ["#f1ece0", colors.textSecondary]))}>
          {connected ? "Connected" : startedNotFinished ? "Setup incomplete" : "Not connected"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary }}>
        Connect your own Stripe account so players can pay their entry fee online. This app never holds or transfers your funds — Stripe pays your organization directly.
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!connect.stripeAccountId && (
          <button style={button.primary} disabled={busy} onClick={startOnboarding}>{busy ? "Redirecting…" : "Connect Stripe"}</button>
        )}
        {startedNotFinished && (
          <button style={button.primary} disabled={busy} onClick={startOnboarding}>{busy ? "Redirecting…" : "Finish Stripe setup"}</button>
        )}
        {connect.stripeAccountId && (
          <button style={button.ghost} disabled={busy} onClick={refreshStatus}>Refresh status</button>
        )}
        {connect.stripeAccountId && (
          <button style={{ ...button.ghost, color: colors.danger }} disabled={busy} onClick={disconnect}>Disconnect</button>
        )}
      </div>
    </div>
  );
}

function linkableTournamentOptions(tournaments, historicalImports, excludeId) {
  return [...tournaments, ...historicalImports]
    .filter((t) => t.id !== excludeId)
    .sort((a, b) => b.year - a.year);
}

function emptyForm(tournament) {
  return {
    name: tournament?.name || "",
    year: tournament?.year || new Date().getFullYear(),
    date: tournament?.date ? tournament.date.slice(0, 10) : "",
    format: tournament?.format || "",
    maxTeamSize: tournament?.maxTeamSize || 4,
    venueName: tournament?.venueName || "",
    venueAddress: tournament?.venueAddress || "",
    flyerImage: tournament?.flyerImage || "",
    flyerImagePosition: tournament?.flyerImagePosition || "center",
    costPerPlayer: tournament?.costPerPlayer || "",
    capacity: tournament?.capacity ?? "",
    includedDescription: tournament?.includedDescription || "",
    scheduleText: tournament?.scheduleText || "",
    contactName: tournament?.contactName || "",
    contactPhone: tournament?.contactPhone || "",
    contactEmail: tournament?.contactEmail || "",
    allowCheckPayment: tournament?.allowCheckPayment || false,
    checkPayableInstructions: tournament?.checkPayableInstructions || "",
    allowInPersonPayment: tournament?.allowInPersonPayment || false,
    inPersonPaymentInstructions: tournament?.inPersonPaymentInstructions || "",
    previousTournamentId: tournament?.previousTournamentId || "",
  };
}

// Handles both create and edit — the form fields are identical either way,
// only the submit action and surrounding chrome (inline card vs. modal) differ.
function TournamentForm({ tournament, tournaments, historicalImports = [], onCancel, onSaved, modal }) {
  const [form, setForm] = useState(emptyForm(tournament));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError("A name is required so you can tell tournaments apart");
    if (!form.date) return setError("A date is required");
    setBusy(true);
    setError("");
    try {
      const payload = { ...form, previousTournamentId: form.previousTournamentId || null };
      if (tournament) await api.updateGolfTournament(tournament.id, payload);
      else await api.createGolfTournament(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const linkOptions = linkableTournamentOptions(tournaments, historicalImports, tournament?.id || null);

  const body = (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="24th Annual Golf Tournament" /></Field>

      <TournamentFlyerField
        image={form.flyerImage}
        position={form.flyerImagePosition}
        onChange={(img) => set("flyerImage", img)}
        onPositionChange={(pos) => set("flyerImagePosition", pos)}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Year"><input style={inputStyle} type="number" required value={form.year} onChange={(e) => set("year", e.target.value)} /></Field>
        <Field label="Date"><input style={inputStyle} type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
      </div>

      <Field label="Format (optional)"><input style={inputStyle} placeholder="Four-Person Team Scramble" value={form.format} onChange={(e) => set("format", e.target.value)} /></Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Max players per team"><input style={inputStyle} type="number" min="1" max="12" required value={form.maxTeamSize} onChange={(e) => set("maxTeamSize", e.target.value)} /></Field>
        <Field label="Cost per player"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.costPerPlayer} onChange={(e) => set("costPerPlayer", e.target.value)} /></Field>
        <Field label="Max teams (optional)"><input style={inputStyle} type="number" min="1" placeholder="Unlimited" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Venue name"><input style={inputStyle} placeholder="Red Hook Golf Club" value={form.venueName} onChange={(e) => set("venueName", e.target.value)} /></Field>
        <Field label="Venue address"><input style={inputStyle} placeholder="650 Route 199, Red Hook, NY" value={form.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} /></Field>
      </div>

      <Field label="What's included (optional)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} placeholder="18 holes with cart, breakfast, lunch on the turn, dinner & prizes" value={form.includedDescription} onChange={(e) => set("includedDescription", e.target.value)} />
      </Field>

      <Field label="Schedule (optional)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} placeholder="9:00 AM Tee off · 11:00 AM Lunch at the turn · 3:30 PM Dinner · 4:00 PM Trophies" value={form.scheduleText} onChange={(e) => set("scheduleText", e.target.value)} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Contact name"><input style={inputStyle} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
        <Field label="Contact phone"><input style={inputStyle} value={formatPhone(form.contactPhone)} onChange={(e) => set("contactPhone", stripPhone(e.target.value))} /></Field>
        <Field label="Contact email"><input style={inputStyle} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4, borderTop: `1px solid ${colors.borderLight}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>Payment options</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary }}>
          Online payment via your organization's connected Stripe account is managed separately — see the payment settings section below. These two are manual options players can choose instead.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.allowCheckPayment} onChange={(e) => set("allowCheckPayment", e.target.checked)} />
          Allow mailing a check
        </label>
        {form.allowCheckPayment && (
          <Field label="Check instructions">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} placeholder="Make checks payable to Red Hook Rhinebeck Elks Lodge, mail to..." value={form.checkPayableInstructions} onChange={(e) => set("checkPayableInstructions", e.target.value)} />
          </Field>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.allowInPersonPayment} onChange={(e) => set("allowInPersonPayment", e.target.checked)} />
          Allow paying in person
        </label>
        {form.allowInPersonPayment && (
          <Field label="In-person instructions">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} placeholder="See the Lodge treasurer at any Wednesday meeting" value={form.inPersonPaymentInstructions} onChange={(e) => set("inPersonPaymentInstructions", e.target.value)} />
          </Field>
        )}
      </div>

      {linkOptions.length > 0 && (
        <Field label="Pull past players/sponsors from (optional)">
          <select style={inputStyle} value={form.previousTournamentId} onChange={(e) => set("previousTournamentId", e.target.value)}>
            <option value="">— None —</option>
            {linkOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : tournament ? "Save changes" : "Create tournament"}</button>
        <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );

  if (modal) {
    return (
      <Modal onCancel={onCancel} width={560} title={tournament ? `Edit "${tournament.name}"` : "New tournament"}>
        {body}
      </Modal>
    );
  }
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>New tournament details</div>
      {body}
    </div>
  );
}

function DeleteTournamentModal({ tournament, onCancel, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      await api.deleteGolfTournament(tournament.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={440} title={`Delete "${tournament.name}"?`}>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
        This permanently removes the tournament and its settings. If any teams have already registered, delete is blocked — close the tournament instead so its roster and history stay on record.
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

// Same pattern as Deals.jsx's LabelPhotoField / ReceiptField — resize
// client-side to a bounded JPEG data URL before it ever leaves the browser,
// then store that string directly (see GolfTournament.flyerImage). Shown at
// the top of the public registration page and its website embed.
//
// The hero band it feeds is wide and short (~1100x280, cropped with
// object-fit: cover) — 1400px on the long edge is already more resolution
// than that ever needs, so this targets a noticeably smaller file than the
// general-purpose resizeImageFile default. A too-large result (a very
// detailed photo can still land big even downsized) retries at lower JPEG
// quality rather than just erroring, since re-encoding is cheap and most
// photos settle well under the cap on the first or second try. The server
// enforces the real ceiling regardless (see golf.js's MAX_FLYER_IMAGE_CHARS)
// — this loop just avoids bothering the admin with an error in the common
// case where a smaller/lower-quality re-encode would've fit fine.
const FLYER_TARGET_CHARS = 500000; // ~375KB raw — leaves headroom under the server's cap
const FLYER_QUALITY_STEPS = [0.82, 0.65, 0.5];
const FLYER_POSITIONS = [
  { value: "top", label: "Top" },
  { value: "center", label: "Center" },
  { value: "bottom", label: "Bottom" },
];

async function resizeFlyerImage(file) {
  let dataUrl;
  for (const quality of FLYER_QUALITY_STEPS) {
    dataUrl = await resizeImageFile(file, 1400, quality);
    if (dataUrl.length <= FLYER_TARGET_CHARS) return dataUrl;
  }
  throw new Error("That photo is too large even compressed — try a smaller or simpler image");
}

function TournamentFlyerField({ image, position, onChange, onPositionChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Attach an image file");
      return;
    }
    setError("");
    setBusy(true);
    try {
      onChange(await resizeFlyerImage(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5c564c" }}>Tournament photo/flyer (optional)</div>
      <div style={{ fontSize: 11, color: colors.textSecondary }}>Shown at the top of your public registration page and website embed.</div>
      {image && (
        <img
          src={image} alt="Tournament flyer"
          style={{ width: "100%", maxWidth: 400, height: 100, objectFit: "cover", objectPosition: `center ${position || "center"}`, borderRadius: 8, border: `1px solid ${colors.border}` }}
        />
      )}
      {image && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textSecondary }}>Crop position:</span>
          {FLYER_POSITIONS.map((p) => (
            <button
              key={p.value} type="button"
              style={{
                ...button.ghost, padding: "4px 10px", fontSize: 11.5,
                ...(position === p.value || (!position && p.value === "center") ? { background: colors.indigoBg, borderColor: colors.accent, color: colors.accent } : {}),
              }}
              onClick={() => onPositionChange(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ cursor: "pointer" }}>
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
          <span style={{ ...button.ghost, display: "inline-block", padding: "6px 12px", fontSize: 12.5 }}>
            {busy ? "Uploading…" : image ? "Replace photo" : "Add photo"}
          </span>
        </label>
        {image && !busy && (
          <button type="button" style={{ ...button.ghost, padding: "6px 10px", fontSize: 12.5, color: colors.danger }} onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 11.5 }}>{error}</div>}
    </div>
  );
}

// Past-years player/sponsor data, uploaded once so the "email last year's
// players/sponsors" marketing lists have real data to pull from instead of
// coming up empty until the org has run a few tournaments inside this app.
// Mirrors ManageRaffles.jsx's HistoricalImports section — golf just has two
// independent lists (players, sponsors) instead of one, so each import can
// either create a new archival tournament or add to an existing one, letting
// both lists for the same year end up on one row (see golf.js's comment on
// why that matters for previousTournamentId linking).
function HistoricalImports({ tournaments, imports, onImportsChanged }) {
  const [showForm, setShowForm] = useState(null); // null | "players" | "sponsors"
  const [editingImport, setEditingImport] = useState(null);
  const confirm = useConfirm();

  async function remove(item) {
    if (!(await confirm(`Remove the imported "${item.name}" data? This deletes its ${item.playerCount} imported player(s) and ${item.sponsorshipCount} imported sponsorship(s) — archival only, no effect on any live tournament.`, { confirmLabel: "Remove" }))) return;
    await api.deleteGolfHistoricalImport(item.id);
    onImportsChanged();
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Historical data</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>
          Import past years' players and/or sponsors so "email last year's players/sponsors" has real data to work with. This is archival only — it never appears as a tournament you can run.
        </div>
      </div>

      {imports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {imports.map((item) => {
            const linkedTo = item.previousTournamentId ? [...tournaments, ...imports].find((t) => t.id === item.previousTournamentId) : null;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", border: `1px solid ${colors.borderLight}`, borderRadius: 7, fontSize: 13 }}>
                <div>
                  <strong>{item.name}</strong>
                  <span style={{ color: colors.textSecondary, marginLeft: 8, fontSize: 12 }}>
                    {item.playerCount} player{item.playerCount === 1 ? "" : "s"} · {item.sponsorshipCount} sponsor{item.sponsorshipCount === 1 ? "" : "s"}
                  </span>
                  <div style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }}>
                    Marketing history source: {linkedTo ? linkedTo.name : <em>none linked</em>}
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
        <div style={{ display: "flex", gap: 10 }}>
          <button style={button.ghost} onClick={() => setShowForm("players")}>+ Import past players</button>
          <button style={button.ghost} onClick={() => setShowForm("sponsors")}>+ Import past sponsors</button>
        </div>
      ) : (
        <HistoricalImportForm
          kind={showForm}
          tournaments={tournaments}
          imports={imports}
          onCancel={() => setShowForm(null)}
          onImported={() => { setShowForm(null); onImportsChanged(); }}
        />
      )}

      {editingImport && (
        <EditHistoricalImportModal
          item={editingImport}
          tournaments={tournaments}
          imports={imports}
          onCancel={() => setEditingImport(null)}
          onSaved={() => { setEditingImport(null); onImportsChanged(); }}
        />
      )}
    </div>
  );
}

function EditHistoricalImportModal({ item, tournaments, imports, onCancel, onSaved }) {
  const [name, setName] = useState(item.name);
  const [previousTournamentId, setPreviousTournamentId] = useState(item.previousTournamentId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const linkOptions = linkableTournamentOptions(tournaments, imports, item.id);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updateGolfHistoricalImport(item.id, { name: name.trim(), previousTournamentId: previousTournamentId || null });
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
        {linkOptions.length > 0 && (
          <Field label="Marketing history source (optional)">
            <select style={inputStyle} value={previousTournamentId} onChange={(e) => setPreviousTournamentId(e.target.value)}>
              <option value="">— None —</option>
              {linkOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        )}
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

const HISTORICAL_IMPORT_COPY = {
  players: {
    title: "Import past players",
    hint: <>The CSV needs at least a <strong>Player Name</strong> column. Team, Email, Phone, and Captain (yes/no) are optional — rows sharing the same Team name are grouped into one team; a blank Team means that row is its own one-player team.</>,
    submit: (payload) => api.importGolfHistoricalPlayers(payload),
    describeResult: (res) => `Imported ${res.imported} player${res.imported === 1 ? "" : "s"} across ${res.teams} team${res.teams === 1 ? "" : "s"}${res.skipped ? ` (${res.skipped} row${res.skipped === 1 ? "" : "s"} skipped — missing a player name)` : ""}.`,
  },
  sponsors: {
    title: "Import past sponsors",
    hint: <>The CSV needs at least a <strong>Company</strong> column. Contact, Email, Phone, Tier, and Amount are optional.</>,
    submit: (payload) => api.importGolfHistoricalSponsors(payload),
    describeResult: (res) => `Imported ${res.imported} sponsor${res.imported === 1 ? "" : "s"}${res.skipped ? ` (${res.skipped} row${res.skipped === 1 ? "" : "s"} skipped — missing a company name)` : ""}.`,
  },
};

function HistoricalImportForm({ kind, tournaments, imports, onCancel, onImported }) {
  const copy = HISTORICAL_IMPORT_COPY[kind];
  const [target, setTarget] = useState("new"); // "new" | an existing import's id
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [previousTournamentId, setPreviousTournamentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const linkOptions = linkableTournamentOptions(tournaments, imports, null);

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
      const payload = target === "new"
        ? { csv, year: Number(year), name: name.trim(), previousTournamentId: previousTournamentId || null }
        : { csv, existingTournamentId: target };
      const res = await copy.submit(payload);
      setNotice(copy.describeResult(res));
      setTimeout(onImported, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, paddingTop: 4, borderTop: `1px solid ${colors.borderLight}` }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{copy.title}</div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary }}>{copy.hint}</div>

      {imports.length > 0 && (
        <Field label="Add to">
          <select style={inputStyle} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">A new archival year</option>
            {imports.map((imp) => (
              <option key={imp.id} value={imp.id}>{imp.name}</option>
            ))}
          </select>
        </Field>
      )}

      {target === "new" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Field label="Year"><input style={inputStyle} type="number" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
            <Field label="Label (optional)"><input style={inputStyle} placeholder={`${year} Golf Tournament (imported)`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </div>
          {linkOptions.length > 0 && (
            <Field label="Marketing history source (optional)">
              <select style={inputStyle} value={previousTournamentId} onChange={(e) => setPreviousTournamentId(e.target.value)}>
                <option value="">— None —</option>
                {linkOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}

      <Field label="CSV file">
        <input type="file" accept=".csv,text/csv" onChange={handleFile} />
      </Field>
      {fileName && <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{fileName}</div>}

      {notice && <div style={{ color: colors.success, fontSize: 12.5 }}>{notice}</div>}
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" style={button.primary} disabled={busy} onClick={submit}>{busy ? "Importing…" : "Import"}</button>
        <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
