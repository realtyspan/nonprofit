import React, { useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatUtcDate } from "../lib/dates";

// Game management (start a raffle, correct its details, open/close it) — kept
// separate from Report, which is pure reporting (stats, payment reminders).
// "Report" is a strange place to find "create a new raffle," which is what
// this view exists to fix.
export default function ManageRaffles({ games, gameId, onGamesChanged }) {
  const [showNewGameForm, setShowNewGameForm] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");

  const selectedGame = games.find((g) => g.id === gameId) || null;

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>All raffles</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Use the selector above to switch which one you're viewing/working in.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 0.6fr auto", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Name</div><div>Tickets</div><div>Price</div><div>Dates</div><div>Status</div><div></div>
        </div>
        {games.map((g) => (
          <div key={g.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 0.6fr auto", padding: "10px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13, background: g.id === gameId ? "#faf9ff" : undefined }}>
            <div style={{ fontWeight: 600 }}>{g.name}</div>
            <div>#{g.startNumber}–#{g.endNumber}</div>
            <div>{money(g.ticketPrice)}</div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>{formatUtcDate(g.raffleStartDate)} – {formatUtcDate(g.raffleEndDate)}</div>
            <span style={pill(g.status === "active" ? colors.successBg : "#f0f0f3", g.status === "active" ? colors.success : colors.textSecondary)}>{g.status}</span>
            <div>
              {g.status === "active" && (
                <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingGame(g)}>Edit</button>
              )}
            </div>
          </div>
        ))}
        {games.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No raffles yet.</div>}
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
          onCancel={() => setShowNewGameForm(false)}
          onCreated={() => { setShowNewGameForm(false); onGamesChanged(); }}
        />
      )}

      {editingGame && (
        <EditGameModal
          game={editingGame}
          onCancel={() => setEditingGame(null)}
          onSaved={() => { setEditingGame(null); onGamesChanged(); }}
        />
      )}
    </div>
  );
}

function NewGameForm({ onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [endNumber, setEndNumber] = useState(400);
  const [ticketPrice, setTicketPrice] = useState(100);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ticketCount = Number(endNumber) - Number(startNumber) + 1;

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="First ticket #"><input style={inputStyle} type="number" min="1" required value={startNumber} onChange={(e) => setStartNumber(e.target.value)} /></Field>
          <Field label="Last ticket #"><input style={inputStyle} type="number" min="1" required value={endNumber} onChange={(e) => setEndNumber(e.target.value)} /></Field>
        </div>
        {ticketCount > 0 && <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{ticketCount} ticket{ticketCount === 1 ? "" : "s"} total</div>}

        <Field label="Ticket price"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} /></Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Raffle start date"><input style={inputStyle} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Closing date / final drawing"><input style={inputStyle} type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Creating…" : "Start raffle"}</button>
        </div>
      </form>
    </div>
  );
}

function EditGameModal({ game, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: game.name,
    startNumber: game.startNumber,
    endNumber: game.endNumber,
    ticketPrice: game.ticketPrice,
    startDate: game.raffleStartDate.slice(0, 10),
    endDate: game.raffleEndDate.slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const ticketCount = Number(form.endNumber) - Number(form.startNumber) + 1;
  const rangeShrinking = Number(form.startNumber) > game.startNumber || Number(form.endNumber) < game.endNumber;

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
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 460, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Edit "{game.name}"</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
          Adding tickets is always safe. Shrinking the range only works if every ticket you're removing is still unsold and unreserved.
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="First ticket #"><input style={inputStyle} type="number" min="1" required value={form.startNumber} onChange={(e) => set("startNumber", e.target.value)} /></Field>
            <Field label="Last ticket #"><input style={inputStyle} type="number" min="1" required value={form.endNumber} onChange={(e) => set("endNumber", e.target.value)} /></Field>
          </div>
          {ticketCount > 0 && (
            <div style={{ fontSize: 11.5, color: rangeShrinking ? colors.warningAmber : colors.textSecondary }}>
              {ticketCount} ticket{ticketCount === 1 ? "" : "s"} total{rangeShrinking ? " — shrinking from " + game.totalTickets : ""}
            </div>
          )}

          <Field label="Ticket price"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} /></Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Raffle start date"><input style={inputStyle} type="date" required value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="Closing date / final drawing"><input style={inputStyle} type="date" required value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
          </div>

          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </div>
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
