import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatUtcDate } from "../lib/dates";

export default function RaffleDrawings({ gameId }) {
  const [drawings, setDrawings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    if (!gameId) return setDrawings([]);
    api.listRaffleDrawings(gameId).then(setDrawings).catch(() => {});
  }
  useEffect(refresh, [gameId]);

  if (!gameId) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No raffle selected.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={button.primary} onClick={() => setShowForm(true)}>+ New drawing</button>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {drawings.map((d) => (
          <DrawingCard key={d.id} gameId={gameId} drawing={d} onChanged={refresh} onError={setError} />
        ))}
        {drawings.length === 0 && <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No drawings set up for this raffle yet.</div>}
      </div>

      {showForm && <DrawingFormModal gameId={gameId} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); refresh(); }} />}
    </div>
  );
}

function DrawingCard({ gameId, drawing, onChanged, onError }) {
  const [eligible, setEligible] = useState(null);
  const [manualNumber, setManualNumber] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    onError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkEligible() {
    try {
      const res = await api.getRaffleDrawingEligible(gameId, drawing.id);
      setEligible(res.count);
    } catch (err) {
      onError(err.message);
    }
  }

  const hasWinner = drawing.winningTicket != null;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{drawing.name}</div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            {formatUtcDate(drawing.drawingDate)} · {drawing.drawingType === "main" ? "Main drawing" : "Early bird"} · {money(drawing.prizeAmount)}
          </div>
        </div>
        {hasWinner ? (
          <span style={pill(colors.successBg, colors.success)}>Ticket #{drawing.winningTicket} — {drawing.winningBuyer}</span>
        ) : (
          <span style={pill("#f0f0f3", colors.textSecondary)}>Not drawn</span>
        )}
      </div>

      {!hasWinner && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button style={button.ghost} disabled={busy} onClick={checkEligible}>Check eligible pool</button>
          {eligible != null && <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{eligible} eligible ticket(s)</span>}
          <button style={button.primary} disabled={busy} onClick={() => run(() => api.drawRaffleDrawing(gameId, drawing.id))}>Draw at random</button>
          <input style={{ ...inputStyle, width: 90 }} placeholder="Ticket #" value={manualNumber} onChange={(e) => setManualNumber(e.target.value.replace(/\D/g, ""))} />
          <button style={button.ghost} disabled={busy || !manualNumber} onClick={() => run(() => api.drawRaffleDrawingManual(gameId, drawing.id, Number(manualNumber)))}>Draw this ticket</button>
          <button
            style={{ ...button.ghost, color: colors.danger, marginLeft: "auto" }}
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete the "${drawing.name}" drawing? This can't be undone.`)) run(() => api.deleteRaffleDrawing(gameId, drawing.id));
            }}
          >
            Delete
          </button>
        </div>
      )}
      {hasWinner && (
        <div>
          <button style={{ ...button.ghost, color: colors.danger }} disabled={busy} onClick={() => run(() => api.clearRaffleDrawing(gameId, drawing.id))}>Clear winner (redraw)</button>
        </div>
      )}
    </div>
  );
}

function DrawingFormModal({ gameId, onCancel, onSaved }) {
  const [name, setName] = useState("");
  const [drawingDate, setDrawingDate] = useState("");
  const [drawingType, setDrawingType] = useState("main");
  const [prizeAmount, setPrizeAmount] = useState(1000);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createRaffleDrawing(gameId, { name, drawingDate, drawingType, prizeAmount: Number(prizeAmount), notes });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }} onClick={onCancel}>
      <div style={{ width: 420, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>New drawing</div>
          <Field label="Name"><input style={inputStyle} required value={name} onChange={(e) => setName(e.target.value)} placeholder="1st Prize" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Date"><input style={inputStyle} type="date" required value={drawingDate} onChange={(e) => setDrawingDate(e.target.value)} /></Field>
            <Field label="Type">
              <select style={inputStyle} value={drawingType} onChange={(e) => setDrawingType(e.target.value)}>
                <option value="main">Main</option>
                <option value="early_bird">Early bird</option>
              </select>
            </Field>
          </div>
          <Field label="Prize amount"><input style={inputStyle} type="number" step="1" required value={prizeAmount} onChange={(e) => setPrizeAmount(e.target.value)} /></Field>
          <Field label="Notes"><input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
            <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Create"}</button>
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
