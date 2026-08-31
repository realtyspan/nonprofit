import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatUtcDate } from "../lib/dates";
import DataList from "../components/DataList";
import Modal from "../components/Modal";
import { useConfirm } from "../lib/ConfirmContext";

function isOverdue(drawingDate) {
  const d = new Date(drawingDate);
  const now = new Date();
  const todayUtcMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() < todayUtcMidnight;
}

const DRAWING_TYPE_LABEL = { main: "Main drawing", early_bird: "Early bird" };

export default function RaffleDrawings({ gameId }) {
  const [drawings, setDrawings] = useState([]);
  const [fundsReceived, setFundsReceived] = useState(null);
  const [formState, setFormState] = useState(null); // { mode: "new" | "edit", drawing? }
  const [conductDrawing, setConductDrawing] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    if (!gameId) return setDrawings([]);
    api.listRaffleDrawings(gameId).then(setDrawings).catch(() => {});
    api.getRaffleStats(gameId).then((s) => setFundsReceived(s.fundsReceived)).catch(() => {});
  }
  useEffect(refresh, [gameId]);

  if (!gameId) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No raffle selected.</div>;
  }

  const scheduled = drawings.filter((d) => d.winningTicket == null).sort((a, b) => new Date(a.drawingDate) - new Date(b.drawingDate));
  const winners = drawings.filter((d) => d.winningTicket != null).sort((a, b) => new Date(b.drawnAt || b.drawingDate) - new Date(a.drawnAt || a.drawingDate));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Drawings</div>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
            Schedule drawing dates, record winners. Only funds-received tickets paid on or before each drawing date are eligible.
            {fundsReceived != null && ` Currently ${fundsReceived} ticket(s) are paid in full.`}
          </div>
        </div>
        <button style={button.primary} onClick={() => setFormState({ mode: "new" })}>+ Add drawing</button>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: colors.textSecondary, letterSpacing: ".03em" }}>Scheduled</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {scheduled.map((d) => (
            <ScheduledCard
              key={d.id}
              drawing={d}
              onConduct={() => setConductDrawing(d)}
              onEdit={() => setFormState({ mode: "edit", drawing: d })}
              onDeleted={refresh}
              onError={setError}
            />
          ))}
        </div>
        {scheduled.length === 0 && <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No drawings scheduled.</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: colors.textSecondary, letterSpacing: ".03em" }}>Winners</div>
        <WinnersTable winners={winners} gameId={gameId} onChanged={refresh} onError={setError} />
      </div>

      {conductDrawing && (
        <ConductDrawingModal
          gameId={gameId}
          drawing={conductDrawing}
          onCancel={() => setConductDrawing(null)}
          onDrawn={() => { setConductDrawing(null); refresh(); }}
          onError={setError}
        />
      )}

      {formState && (
        <DrawingFormModal
          gameId={gameId}
          state={formState}
          onCancel={() => setFormState(null)}
          onSaved={() => { setFormState(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ScheduledCard({ drawing, onConduct, onEdit, onDeleted, onError }) {
  const [busy, setBusy] = useState(false);
  const overdue = isOverdue(drawing.drawingDate);
  const confirm = useConfirm();

  async function deleteDrawing() {
    if (!(await confirm(`Delete the "${drawing.name}" drawing? This can't be undone.`))) return;
    setBusy(true);
    onError("");
    try {
      await api.deleteRaffleDrawing(drawing.gameId, drawing.id);
      onDeleted();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: colors.textTertiary, letterSpacing: ".03em" }}>
          {DRAWING_TYPE_LABEL[drawing.drawingType] || drawing.drawingType}
        </span>
        <span style={overdue ? pill("#fee2e2", colors.danger) : pill(colors.successBg, colors.success)}>
          {overdue ? "Overdue" : "Upcoming"}
        </span>
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{drawing.name}</div>
        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Drawing date: {formatUtcDate(drawing.drawingDate)}</div>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>Prize: {money(drawing.prizeAmount)}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={button.primary} disabled={busy} onClick={onConduct}>Conduct drawing</button>
        <button style={button.ghost} disabled={busy} onClick={onEdit}>Edit</button>
        <button style={{ ...button.ghost, color: colors.danger }} disabled={busy} onClick={deleteDrawing}>Delete</button>
      </div>
    </div>
  );
}

function ConductDrawingModal({ gameId, drawing, onCancel, onDrawn, onError }) {
  const [eligible, setEligible] = useState(null);
  const [manualNumber, setManualNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function checkEligible() {
    setLocalError("");
    try {
      const res = await api.getRaffleDrawingEligible(gameId, drawing.id);
      setEligible(res.count);
    } catch (err) {
      setLocalError(err.message);
    }
  }

  async function run(fn) {
    setBusy(true);
    setLocalError("");
    try {
      await fn();
      onDrawn();
    } catch (err) {
      setLocalError(err.message);
      onError("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={420} title="Conduct drawing">
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2, marginBottom: 16 }}>
        {drawing.name} · {formatUtcDate(drawing.drawingDate)} · {money(drawing.prizeAmount)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={button.ghost} disabled={busy} onClick={checkEligible}>Check eligible pool</button>
          {eligible != null && <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{eligible} eligible ticket(s)</span>}
        </div>

        <button style={button.primary} disabled={busy} onClick={() => run(() => api.drawRaffleDrawing(gameId, drawing.id))}>
          {busy ? "Drawing…" : "Draw at random"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input style={{ ...inputStyle, width: 100 }} placeholder="Ticket #" value={manualNumber} onChange={(e) => setManualNumber(e.target.value.replace(/\D/g, ""))} />
          <button style={button.ghost} disabled={busy || !manualNumber} onClick={() => run(() => api.drawRaffleDrawingManual(gameId, drawing.id, Number(manualNumber)))}>
            Draw this ticket
          </button>
        </div>

        {localError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{localError}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function WinnersTable({ winners, gameId, onChanged, onError }) {
  const [busyId, setBusyId] = useState(null);
  const confirm = useConfirm();

  async function redraw(drawing) {
    if (!(await confirm(`Clear the winner for "${drawing.name}" so it can be redrawn?`, { confirmLabel: "Clear winner", danger: false }))) return;
    setBusyId(drawing.id);
    onError("");
    try {
      await api.clearRaffleDrawing(gameId, drawing.id);
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (winners.length === 0) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No winners drawn yet.</div>;
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <DataList
        rows={winners}
        columns={[
          { key: "drawing", label: "Drawing", grid: "1.3fr", primary: true, render: (w) => w.name },
          { key: "date", label: "Date", grid: "1fr", render: (w) => <span style={{ color: colors.textSecondary }}>{formatUtcDate(w.drawnAt || w.drawingDate)}</span> },
          { key: "ticket", label: "Ticket #", grid: "0.8fr", render: (w) => <span style={{ color: colors.indigo, fontWeight: 700 }}>#{w.winningTicket}</span> },
          { key: "buyer", label: "Buyer", grid: "1.3fr", render: (w) => w.winningBuyer },
          { key: "prize", label: "Prize", grid: "0.9fr", render: (w) => money(w.prizeAmount) },
          { key: "pool", label: "Pool", grid: "1.3fr", render: (w) => <span style={{ color: colors.textSecondary }}>{w.eligibleCount} eligible {w.drawMode === "manual" ? "(manual)" : "(random)"}</span> },
          {
            key: "actions", label: "", grid: "auto", fullWidthOnMobile: true,
            render: (w) => <button style={{ ...button.ghost, color: colors.danger }} disabled={busyId === w.id} onClick={() => redraw(w)}>Redraw</button>,
          },
        ]}
      />
    </div>
  );
}

function DrawingFormModal({ gameId, state, onCancel, onSaved }) {
  const { mode, drawing } = state;
  const [name, setName] = useState(drawing?.name || "");
  const [drawingDate, setDrawingDate] = useState(drawing ? drawing.drawingDate.slice(0, 10) : "");
  const [drawingType, setDrawingType] = useState(drawing?.drawingType || "main");
  const [prizeAmount, setPrizeAmount] = useState(drawing?.prizeAmount ?? 1000);
  const [notes, setNotes] = useState(drawing?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { name, drawingDate, drawingType, prizeAmount: Number(prizeAmount), notes };
      if (mode === "edit") await api.updateRaffleDrawing(gameId, drawing.id, payload);
      else await api.createRaffleDrawing(gameId, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={420} title={mode === "edit" ? "Edit drawing" : "New drawing"}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Name"><input style={inputStyle} required value={name} onChange={(e) => setName(e.target.value)} placeholder="1st Prize" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
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
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : mode === "edit" ? "Save" : "Create"}</button>
        </div>
      </form>
    </Modal>
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
