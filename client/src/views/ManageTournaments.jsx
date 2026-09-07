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

// Direct port of ManageGolfTournaments.jsx, generalized off "golf" and
// adding the org-managed tournament-type list. Marketing email, check-in,
// sponsorships, and historical import are deliberately not ported yet —
// see the plan doc's slice-1 scope.
export default function ManageTournaments({ tournaments, tournamentId, onTournamentsChanged }) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [deletingTournament, setDeletingTournament] = useState(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [flyerBusy, setFlyerBusy] = useState(false);
  const [flyerError, setFlyerError] = useState("");
  const [showFlyerColors, setShowFlyerColors] = useState(false);
  const [types, setTypes] = useState([]);

  function refreshTypes() {
    api.listTournamentTypes().then(setTypes).catch(() => {});
  }
  useEffect(refreshTypes, []);

  const selected = tournaments.find((t) => t.id === tournamentId) || null;

  async function toggleLifecycle() {
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      if (selected.status === "open") await api.closeTournament(tournamentId);
      else if (selected.status === "closed") await api.reopenTournament(tournamentId);
      else await api.openTournament(tournamentId);
      onTournamentsChanged();
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setLifecycleBusy(false);
    }
  }

  const lifecycleLabel = selected?.status === "open" ? "Close tournament" : selected?.status === "closed" ? "Reopen tournament" : "Open for registration";

  async function downloadFlyer() {
    setFlyerBusy(true);
    setFlyerError("");
    try {
      await api.downloadTournamentFlyerPdf(tournamentId, selected.name);
    } catch (err) {
      setFlyerError(err.message);
    } finally {
      setFlyerBusy(false);
    }
  }
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
            {selected.type?.name ? `${selected.type.name} · ` : ""}{money(selected.costPerPlayer)}/player · {selected.maxTeamSize}-person teams
            {selected.capacity ? ` · ${selected.registeredTeamCount}/${selected.capacity} teams registered` : ` · ${selected.registeredTeamCount} team${selected.registeredTeamCount === 1 ? "" : "s"} registered`}
            {selected.venueName ? ` · ${selected.venueName}` : ""}
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            Payment options: {[
              selected.allowCheckPayment && "mail a check",
              selected.allowInPersonPayment && "pay in person",
            ].filter(Boolean).join(", ") || "none enabled yet"}
          </div>
          {lifecycleError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{lifecycleError}</div>}
          {flyerError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{flyerError}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              style={selected.status === "open" ? { ...button.ghost, color: colors.danger } : button.primary}
              disabled={lifecycleBusy}
              onClick={toggleLifecycle}
            >
              {lifecycleBusy ? "Working…" : lifecycleLabel}
            </button>
            <button style={button.secondary} disabled={flyerBusy} onClick={downloadFlyer}>
              {flyerBusy ? "Generating…" : "Download flyer (PDF)"}
            </button>
            <button style={button.ghost} onClick={() => setShowFlyerColors((s) => !s)}>{showFlyerColors ? "Hide flyer colors" : "Flyer colors"}</button>
          </div>
          {showFlyerColors && <FlyerColorsCard />}
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>All tournaments</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Use the selector above to switch which one you're viewing/working in. More than one can be open at once, even of different types.</div>
        </div>
        <DataList
          rows={tournaments}
          rowStyle={(t) => (t.id === tournamentId ? { background: colors.accentSoft } : undefined)}
          emptyMessage="No tournaments yet."
          columns={[
            { key: "name", label: "Name", grid: "1.3fr", primary: true, render: (t) => t.name },
            { key: "type", label: "Type", grid: "0.9fr", render: (t) => t.type?.name || "—" },
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

      <TournamentTypesCard types={types} onChanged={refreshTypes} />

      {!showNewForm ? (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{tournaments.length === 0 ? "Start your first tournament" : "Start another tournament"}</div>
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            Creating a new tournament never touches any other tournament — you can run more than one, of different types, each with its own roster, pricing, and dates.
          </div>
          {types.length === 0 ? (
            <div style={{ fontSize: 12.5, color: colors.warning }}>Add a tournament type above first (e.g. "Golf," "Horseshoes," "Cornhole").</div>
          ) : (
            <div><button style={button.primary} onClick={() => setShowNewForm(true)}>+ New tournament</button></div>
          )}
        </div>
      ) : (
        <TournamentForm
          types={types}
          tournaments={tournaments}
          onCancel={() => setShowNewForm(false)}
          onSaved={() => { setShowNewForm(false); onTournamentsChanged(); }}
        />
      )}

      {editingTournament && (
        <TournamentForm
          tournament={editingTournament}
          types={types}
          tournaments={tournaments}
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
        basePath="tournaments"
        embedBasePath="tournaments/embed"
        embedTitle="Tournament Registration"
        description="Set a link so players can view open tournaments and register a team from your website."
      />

      <StripeConnectCard />
    </div>
  );
}

// Org-managed list of tournament types — the control the user asked for so
// "type" is a chosen list, not free text. Small enough to live inline here
// rather than earn its own nav item.
function TournamentTypesCard({ types, onChanged }) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();

  async function add(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createTournamentType(newName.trim());
      setNewName("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(type) {
    if (!(await confirm(`Remove tournament type "${type.name}"?`, { confirmLabel: "Remove" }))) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteTournamentType(type.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Tournament types</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Your own list — add whatever your organization actually runs (Golf, Horseshoes, Cornhole, etc.).</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {types.map((t) => (
          <span key={t.id} style={{ ...pill("#f1ece0", colors.textSecondary), display: "flex", alignItems: "center", gap: 6 }}>
            {t.name}
            <button type="button" onClick={() => remove(t)} disabled={busy} style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
        {types.length === 0 && <span style={{ fontSize: 12.5, color: colors.textSecondary }}>No types yet — add one below.</span>}
      </div>
      <form onSubmit={add} style={{ display: "flex", gap: 8 }}>
        <input style={{ ...inputStyle, maxWidth: 220 }} placeholder="e.g. Horseshoes" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" style={button.ghost} disabled={busy}>{busy ? "Adding…" : "+ Add type"}</button>
      </form>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
    </div>
  );
}

// Org-wide (not per-tournament) — the two brand colors a generated flyer
// draws with. Shared with Golf's own flyer (same org.flyerPrimaryColor/
// flyerAccentColor fields) — setting them here also affects Golf's flyer,
// which is expected: it's one org identity, not a per-module setting.
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

function StripeConnectCard() {
  const [connect, setConnect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();

  function reload() {
    api.getTournamentsStripeConnect().then(setConnect).catch((err) => setError(err.message));
  }

  useEffect(reload, []);

  async function startOnboarding() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api.onboardTournamentsStripeConnect();
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
      setConnect(await api.syncTournamentsStripeConnect());
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
      await api.disconnectTournamentsStripeConnect();
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
  const restricted = startedNotFinished && connect.onboardingStatus === "restricted";
  const disconnected = startedNotFinished && !restricted && !!connect.disconnectedAt;
  const primaryActionLabel = restricted ? "Continue with Stripe" : disconnected ? "Reconnect Stripe" : "Finish Stripe setup";

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Online payment settings</div>
        <span style={pill(...(connected ? [colors.successBg, colors.success] : ["#f1ece0", colors.textSecondary]))}>
          {connected ? "Connected" : startedNotFinished ? "Setup incomplete" : "Not connected"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary }}>
        Connect your own Stripe account so players can pay their entry fee online. This app never holds or transfers your funds — Stripe pays your organization directly. If you've already connected Stripe for Golf, this is the same account — no need to connect twice.
      </div>
      {restricted && (
        <div style={{ fontSize: 12, color: colors.warning, background: colors.warningBg, padding: "8px 10px", borderRadius: 7 }}>
          <strong>Stripe needs more information from you.</strong> This can happen even after setup is mostly done — players can't pay online until it's finished, usually just a few minutes on Stripe's own form.
        </div>
      )}
      {disconnected && (
        <div style={{ fontSize: 12, color: colors.danger, background: colors.dangerBg, padding: "8px 10px", borderRadius: 7 }}>
          <strong>Online payment is currently turned off for this org.</strong> Reconnect whenever you're ready.
        </div>
      )}
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!connect.stripeAccountId && (
          <button style={button.primary} disabled={busy} onClick={startOnboarding}>{busy ? "Redirecting…" : "Connect Stripe"}</button>
        )}
        {startedNotFinished && (
          <button style={button.primary} disabled={busy} onClick={startOnboarding}>{busy ? "Redirecting…" : primaryActionLabel}</button>
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

function linkableTournamentOptions(tournaments, excludeId) {
  return tournaments.filter((t) => t.id !== excludeId).sort((a, b) => b.year - a.year);
}

function emptyForm(tournament) {
  return {
    typeId: tournament?.typeId || "",
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
    includedItems: tournament?.includedItems?.length ? tournament.includedItems : [""],
    scheduleItems: tournament?.scheduleItems?.length ? tournament.scheduleItems : [{ time: "", label: "" }],
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

function TournamentForm({ tournament, types, tournaments, onCancel, onSaved, modal }) {
  const [form, setForm] = useState(emptyForm(tournament));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setIncludedItem(i, v) {
    setForm((f) => ({ ...f, includedItems: f.includedItems.map((item, idx) => (idx === i ? v : item)) }));
  }
  function addIncludedItem() {
    setForm((f) => ({ ...f, includedItems: [...f.includedItems, ""] }));
  }
  function removeIncludedItem(i) {
    setForm((f) => ({ ...f, includedItems: f.includedItems.filter((_, idx) => idx !== i) }));
  }

  function setScheduleItem(i, k, v) {
    setForm((f) => ({ ...f, scheduleItems: f.scheduleItems.map((item, idx) => (idx === i ? { ...item, [k]: v } : item)) }));
  }
  function addScheduleItem() {
    setForm((f) => ({ ...f, scheduleItems: [...f.scheduleItems, { time: "", label: "" }] }));
  }
  function removeScheduleItem(i) {
    setForm((f) => ({ ...f, scheduleItems: f.scheduleItems.filter((_, idx) => idx !== i) }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.typeId) return setError("Choose a tournament type");
    if (!form.name.trim()) return setError("A name is required so you can tell tournaments apart");
    if (!form.date) return setError("A date is required");
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        includedItems: form.includedItems.map((s) => s.trim()).filter(Boolean),
        scheduleItems: form.scheduleItems.map((r) => ({ time: r.time.trim(), label: r.label.trim() })).filter((r) => r.label),
        previousTournamentId: form.previousTournamentId || null,
      };
      if (tournament) await api.updateTournament(tournament.id, payload);
      else await api.createTournament(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const linkOptions = linkableTournamentOptions(tournaments, tournament?.id || null);

  const body = (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label="Type">
        <select style={inputStyle} required value={form.typeId} onChange={(e) => set("typeId", e.target.value)}>
          <option value="">— Choose a type —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>

      <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Fall Cornhole Bash" /></Field>

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

      <Field label="Format (optional)"><input style={inputStyle} placeholder="e.g. Doubles Bracket, Four-Person Scramble" value={form.format} onChange={(e) => set("format", e.target.value)} /></Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Max players per team"><input style={inputStyle} type="number" min="1" max="12" required value={form.maxTeamSize} onChange={(e) => set("maxTeamSize", e.target.value)} /></Field>
        <Field label="Cost per player"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.costPerPlayer} onChange={(e) => set("costPerPlayer", e.target.value)} /></Field>
        <Field label="Max teams (optional)"><input style={inputStyle} type="number" min="1" placeholder="Unlimited" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Field label="Venue name"><input style={inputStyle} placeholder="Lodge lawn" value={form.venueName} onChange={(e) => set("venueName", e.target.value)} /></Field>
        <Field label="Venue address"><input style={inputStyle} placeholder="650 Route 199, Red Hook, NY" value={form.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} /></Field>
      </div>

      <Field label="What's included (optional)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {form.includedItems.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Two bags per team, boards provided" value={item} onChange={(e) => setIncludedItem(i, e.target.value)} />
              {form.includedItems.length > 1 && (
                <button type="button" style={{ ...button.ghost, padding: "6px 10px", fontSize: 12 }} onClick={() => removeIncludedItem(i)}>Remove</button>
              )}
            </div>
          ))}
          <div><button type="button" style={button.ghost} onClick={addIncludedItem}>+ Add item</button></div>
        </div>
        <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>Each item shows as its own bullet on the public page.</div>
      </Field>

      <Field label="Schedule (optional)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {form.scheduleItems.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input style={{ ...inputStyle, flex: "0 0 110px" }} placeholder="9:00 AM" value={item.time} onChange={(e) => setScheduleItem(i, "time", e.target.value)} />
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Check-in and warmups" value={item.label} onChange={(e) => setScheduleItem(i, "label", e.target.value)} />
              {form.scheduleItems.length > 1 && (
                <button type="button" style={{ ...button.ghost, padding: "6px 10px", fontSize: 12 }} onClick={() => removeScheduleItem(i)}>Remove</button>
              )}
            </div>
          ))}
          <div><button type="button" style={button.ghost} onClick={addScheduleItem}>+ Add schedule item</button></div>
        </div>
        <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>Time is optional — leave it blank for an item with no fixed time.</div>
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
            <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} placeholder="Make checks payable to..." value={form.checkPayableInstructions} onChange={(e) => set("checkPayableInstructions", e.target.value)} />
          </Field>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.allowInPersonPayment} onChange={(e) => set("allowInPersonPayment", e.target.checked)} />
          Allow paying in person
        </label>
        {form.allowInPersonPayment && (
          <Field label="In-person instructions">
            <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} placeholder="See the treasurer at any Wednesday meeting" value={form.inPersonPaymentInstructions} onChange={(e) => set("inPersonPaymentInstructions", e.target.value)} />
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
      await api.deleteTournament(tournament.id);
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

// Same pattern as ManageGolfTournaments.jsx's own copy — resize client-side
// to a bounded JPEG data URL before it ever leaves the browser.
const FLYER_TARGET_CHARS = 500000;
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

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
