import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatUtcDate } from "../lib/dates";

export default function RaffleReport({ games, gameId, onGamesChanged }) {
  const [stats, setStats] = useState(null);
  const [showNewGameForm, setShowNewGameForm] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");

  const selectedGame = games.find((g) => g.id === gameId) || null;

  function refreshStats() {
    if (!gameId) return setStats(null);
    api.getRaffleStats(gameId).then(setStats).catch(() => {});
  }
  useEffect(refreshStats, [gameId]);

  async function sendReminders() {
    setReminderBusy(true);
    setReminderError("");
    setReminderNotice("");
    try {
      const res = await api.sendRaffleReminders(gameId);
      setReminderNotice(`Sent ${res.sent} of ${res.candidates} reminder(s).`);
    } catch (err) {
      setReminderError(err.message);
    } finally {
      setReminderBusy(false);
    }
  }

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
      {selectedGame && stats && (
        <>
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {selectedGame.name} — tickets #{selectedGame.startNumber}–#{selectedGame.endNumber}
              </div>
              <span style={pill(selectedGame.status === "active" ? colors.successBg : "#f0f0f3", selectedGame.status === "active" ? colors.success : colors.textSecondary)}>
                {selectedGame.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>
              Runs {formatUtcDate(selectedGame.raffleStartDate)} through {formatUtcDate(selectedGame.raffleEndDate)} (final drawing)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Stat label="Total tickets" value={stats.total} />
              <Stat label="Sold or better" value={stats.sold + stats.fundsReceived} />
              <Stat label="Revenue collected" value={money(stats.revenue)} />
              <Stat label="Unsold potential" value={money(stats.available * selectedGame.ticketPrice)} />
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>
              Available: {stats.available} · Reserved: {stats.reserved} · Sold (not yet deposited): {stats.sold} · Funds received: {stats.fundsReceived}
            </div>
          </div>

          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Payment reminders</div>
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>Emails every sold or reserved ticket with an email on file that hasn't had funds received yet.</div>
            {reminderError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{reminderError}</div>}
            {reminderNotice && <div style={{ color: colors.success, fontSize: 12.5 }}>{reminderNotice}</div>}
            <div><button style={button.ghost} disabled={reminderBusy} onClick={sendReminders}>{reminderBusy ? "Sending…" : "Send reminders now"}</button></div>
          </div>

          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedGame.status === "active" ? "Close this raffle" : "Reopen this raffle"}</div>
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
              {selectedGame.status === "active"
                ? "Stops new sales, drawings, and check-ins for this raffle. Its tickets and history stay fully visible for reporting. Other raffles are unaffected."
                : "Allows new sales, drawings, and check-ins for this raffle again."}
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
        </>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>All raffles</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Use the selector above to switch which one you're viewing/working in.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 0.6fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Name</div><div>Tickets</div><div>Price</div><div>Dates</div><div>Status</div>
        </div>
        {games.map((g) => (
          <div key={g.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 0.6fr", padding: "10px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13, background: g.id === gameId ? "#faf9ff" : undefined }}>
            <div style={{ fontWeight: 600 }}>{g.name}</div>
            <div>#{g.startNumber}–#{g.endNumber}</div>
            <div>{money(g.ticketPrice)}</div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>{formatUtcDate(g.raffleStartDate)} – {formatUtcDate(g.raffleEndDate)}</div>
            <span style={pill(g.status === "active" ? colors.successBg : "#f0f0f3", g.status === "active" ? colors.success : colors.textSecondary)}>{g.status}</span>
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

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
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
