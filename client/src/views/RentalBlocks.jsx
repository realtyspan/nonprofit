import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import DateTimeField from "../components/DateTimeField";

const WEEKDAYS = [
  { key: "SU", label: "S" }, { key: "MO", label: "M" }, { key: "TU", label: "T" }, { key: "WE", label: "W" },
  { key: "TH", label: "T" }, { key: "FR", label: "F" }, { key: "SA", label: "S" },
];
const WEEKDAY_FULL = [
  { key: "SU", label: "Sunday" }, { key: "MO", label: "Monday" }, { key: "TU", label: "Tuesday" }, { key: "WE", label: "Wednesday" },
  { key: "TH", label: "Thursday" }, { key: "FR", label: "Friday" }, { key: "SA", label: "Saturday" },
];
const ORDINALS = [{ v: 1, label: "1st" }, { v: 2, label: "2nd" }, { v: 3, label: "3rd" }, { v: 4, label: "4th" }, { v: -1, label: "Last" }];

export default function RentalBlocks({ spaces }) {
  const [blocks, setBlocks] = useState([]);
  const [formState, setFormState] = useState(null); // { mode: "new"|"editOne"|"editSeries", block? }
  const [detailBlock, setDetailBlock] = useState(null);

  function refresh() {
    api.listRentalBlocks().then(setBlocks).catch(() => {});
  }

  useEffect(refresh, []);

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Internal blocks</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Hold a space for the Lodge's own use — a meeting, a members-only function, maintenance. Shown as unavailable on the public calendar by default.</div>
        </div>
        <button style={button.ghost} onClick={() => setFormState({ mode: "new" })}>+ Add block</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1.2fr 1fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
        <div>Space</div>
        <div>Start</div>
        <div>End</div>
        <div>Reason</div>
        <div></div>
      </div>
      {blocks.map((b) => (
        <div
          key={b.id}
          onClick={() => setDetailBlock(b)}
          style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1.2fr 1fr", padding: "12px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5, cursor: "pointer" }}
        >
          <div style={{ fontWeight: 600 }}>{b.space?.name}</div>
          <div>{new Date(b.startAt).toLocaleString()}</div>
          <div>{new Date(b.endAt).toLocaleString()}</div>
          <div style={{ color: colors.textSecondary }}>{b.reason || "—"}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {b.recurrenceId && <span style={pill("#f0f0f3", colors.textSecondary)}>Repeats</span>}
            {b.calendarEventId && <span style={pill(colors.indigoBg, colors.indigo)}>From Calendar</span>}
            <span style={pill(b.visibleOnPublicCalendar ? colors.indigoBg : "#f0f0f3", b.visibleOnPublicCalendar ? colors.indigo : colors.textSecondary)}>
              {b.visibleOnPublicCalendar ? "Public" : "Internal only"}
            </span>
          </div>
        </div>
      ))}
      {blocks.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No internal blocks.</div>}

      {detailBlock && (
        <BlockDetailModal
          block={detailBlock}
          onClose={() => setDetailBlock(null)}
          onEdit={(mode) => { setFormState({ mode, block: detailBlock }); setDetailBlock(null); }}
          onDeleted={() => { setDetailBlock(null); refresh(); }}
        />
      )}

      {formState && (
        <BlockFormModal
          state={formState}
          spaces={spaces}
          onCancel={() => setFormState(null)}
          onSaved={() => { setFormState(null); refresh(); }}
        />
      )}
    </div>
  );
}

function BlockDetailModal({ block, onClose, onEdit, onDeleted }) {
  const isRecurring = !!block.recurrenceId;
  const isFromCalendar = !!block.calendarEventId;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteOne() {
    setBusy(true);
    setError("");
    try {
      await api.deleteRentalBlock(block.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteSeries() {
    setBusy(true);
    setError("");
    try {
      await api.deleteRentalBlockRecurrence(block.recurrenceId);
      onDeleted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onCancel={onClose} width={380}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{block.space?.name}</div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 4 }}>
        {new Date(block.startAt).toLocaleString()} – {new Date(block.endAt).toLocaleTimeString()}
      </div>
      {block.reason && <div style={{ fontSize: 13, marginBottom: 10 }}>{block.reason}</div>}
      <div style={{ fontSize: 11.5, color: colors.textTertiary, marginBottom: 14 }}>
        {block.visibleOnPublicCalendar ? "Shown as unavailable on the public calendar." : "Internal only — not shown publicly."}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

      {isFromCalendar && (
        <div style={{ fontSize: 11.5, color: colors.textTertiary, marginBottom: 10 }}>
          Managed by the Calendar module — edit or remove the event there.
        </div>
      )}

      {!isFromCalendar && !confirmDelete && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isRecurring ? (
            <>
              <button style={button.ghost} onClick={() => onEdit("editOne")}>Edit this date only</button>
              <button style={button.ghost} onClick={() => onEdit("editSeries")}>Edit entire series</button>
            </>
          ) : (
            <button style={button.ghost} onClick={() => onEdit("editOne")}>Edit</button>
          )}
          <button style={{ ...button.ghost, color: colors.danger }} onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      )}

      {!isFromCalendar && confirmDelete && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isRecurring ? (
            <>
              <button style={button.ghost} disabled={busy} onClick={deleteOne}>Delete this date only</button>
              <button style={{ ...button.ghost, color: colors.danger }} disabled={busy} onClick={deleteSeries}>Delete entire series</button>
            </>
          ) : (
            <button style={{ ...button.ghost, color: colors.danger }} disabled={busy} onClick={deleteOne}>Confirm delete</button>
          )}
          <button style={button.ghost} onClick={() => setConfirmDelete(false)}>Never mind</button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button style={button.ghost} onClick={onClose}>Close</button>
      </div>
    </ModalShell>
  );
}

function BlockFormModal({ state, spaces, onCancel, onSaved }) {
  const { mode, block } = state;
  const isSeries = mode === "editSeries";
  const start = block ? new Date(block.startAt) : (() => { const d = new Date(); d.setHours(19, 0, 0, 0); return d; })();
  const end = block ? new Date(block.endAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const [spaceId, setSpaceId] = useState(block?.spaceId || spaces[0]?.id || "");
  const [reason, setReason] = useState(block?.reason || "");
  const [visible, setVisible] = useState(block?.visibleOnPublicCalendar ?? true);
  const [startAt, setStartAt] = useState(toLocalInput(start));
  const [endAt, setEndAt] = useState(toLocalInput(end));
  const [repeats, setRepeats] = useState(mode === "editSeries");
  const [freq, setFreq] = useState("monthly");
  const [interval, setIntervalVal] = useState(1);
  const [byWeekday, setByWeekday] = useState([]);
  const [monthlyMode, setMonthlyMode] = useState("date"); // "date" | "weekday"
  const [monthlyWeekday, setMonthlyWeekday] = useState("TU");
  const [monthlyOrdinals, setMonthlyOrdinals] = useState([2, 4]);
  const [repeatUntil, setRepeatUntil] = useState(toDateInput(new Date(start.getFullYear() + 1, start.getMonth(), start.getDate())));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadingSeries, setLoadingSeries] = useState(isSeries);

  useEffect(() => {
    if (mode === "editSeries" && block?.recurrenceId) {
      api.getRentalBlockRecurrence(block.recurrenceId).then((rec) => {
        setSpaceId(rec.spaceId);
        setReason(rec.reason || "");
        setVisible(rec.visibleOnPublicCalendar);
        setFreq(rec.freq);
        setIntervalVal(rec.interval);
        if (rec.freq === "monthly" && rec.byWeekdayOrdinal) {
          setMonthlyMode("weekday");
          setMonthlyWeekday(rec.byWeekday || "TU");
          setMonthlyOrdinals(rec.byWeekdayOrdinal.split(",").map(Number));
        } else {
          setMonthlyMode("date");
          setByWeekday(rec.byWeekday ? rec.byWeekday.split(",") : []);
        }
        setStartAt(toLocalInput(new Date(`${toDateInput(rec.startDate)}T${rec.startTime}`)));
        setEndAt(toLocalInput(new Date(`${toDateInput(rec.startDate)}T${rec.endTime}`)));
        setRepeatUntil(toDateInput(rec.endDate));
        setLoadingSeries(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleWeekday(k) {
    setByWeekday((cur) => (cur.includes(k) ? cur.filter((w) => w !== k) : [...cur, k]));
  }
  function toggleOrdinal(v) {
    setMonthlyOrdinals((cur) => (cur.includes(v) ? cur.filter((o) => o !== v) : [...cur, v]));
  }

  function recurrenceFields() {
    if (freq === "monthly" && monthlyMode === "weekday") {
      return { freq, interval: Number(interval), byWeekday: monthlyWeekday, byWeekdayOrdinal: monthlyOrdinals.slice().sort().join(",") };
    }
    return { freq, interval: Number(interval), byWeekday: freq === "weekly" ? byWeekday.join(",") : null, byWeekdayOrdinal: null };
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const base = { spaceId, reason, visibleOnPublicCalendar: visible };
      if (mode === "new" && repeats) {
        await api.createRentalBlock({
          ...base,
          recurrence: { ...recurrenceFields(), startDate: startAt.slice(0, 10), endDate: repeatUntil, startTime: hhmm(startAt), endTime: hhmm(endAt) },
        });
      } else if (mode === "new") {
        await api.createRentalBlock({ ...base, startAt, endAt });
      } else if (mode === "editOne") {
        await api.updateRentalBlock(block.id, { reason, visibleOnPublicCalendar: visible, startAt, endAt });
      } else if (mode === "editSeries") {
        await api.updateRentalBlockRecurrence(block.recurrenceId, {
          reason, visibleOnPublicCalendar: visible, ...recurrenceFields(),
          startDate: startAt.slice(0, 10), endDate: repeatUntil, startTime: hhmm(startAt), endTime: hhmm(endAt),
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadingSeries) return null;

  return (
    <ModalShell onCancel={onCancel} width={460}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {mode === "new" ? "Add internal block" : mode === "editSeries" ? "Edit entire series" : "Edit block"}
        </div>

        <Field label="Space">
          <select style={inputStyle} value={spaceId} onChange={(e) => setSpaceId(e.target.value)} disabled={mode !== "new"}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Reason"><input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Trustees meeting" /></Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DateTimeField label="Start" value={startAt} onChange={setStartAt} />
          <DateTimeField label="End" value={endAt} onChange={setEndAt} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Show as unavailable on the public calendar
        </label>

        {mode === "new" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            Repeats (e.g. a standing meeting)
          </label>
        )}

        {(repeats || mode === "editSeries") && (
          <div style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Frequency">
                <select style={inputStyle} value={freq} onChange={(e) => setFreq(e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="daily">Daily</option>
                </select>
              </Field>
              <Field label="Every"><input style={inputStyle} type="number" min="1" value={interval} onChange={(e) => setIntervalVal(e.target.value)} /></Field>
            </div>
            {freq === "weekly" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b", marginBottom: 6 }}>On these days</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {WEEKDAYS.map((w) => (
                    <button
                      type="button" key={w.key} onClick={() => toggleWeekday(w.key)}
                      style={{
                        width: 30, height: 30, borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: `1px solid ${byWeekday.includes(w.key) ? colors.accent : colors.border}`,
                        background: byWeekday.includes(w.key) ? colors.accent : "#fff",
                        color: byWeekday.includes(w.key) ? "#fff" : colors.textSecondary,
                      }}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {freq === "monthly" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <input type="radio" checked={monthlyMode === "date"} onChange={() => setMonthlyMode("date")} />
                    Day {new Date(startAt).getDate()} of the month
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <input type="radio" checked={monthlyMode === "weekday"} onChange={() => setMonthlyMode("weekday")} />
                    By weekday (e.g. "2nd and 4th Tuesday")
                  </label>
                </div>
                {monthlyMode === "weekday" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Field label="Weekday">
                      <select style={inputStyle} value={monthlyWeekday} onChange={(e) => setMonthlyWeekday(e.target.value)}>
                        {WEEKDAY_FULL.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
                      </select>
                    </Field>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b", marginBottom: 6 }}>Which occurrence(s)</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {ORDINALS.map((o) => (
                          <button
                            type="button" key={o.v} onClick={() => toggleOrdinal(o.v)}
                            style={{
                              padding: "5px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${monthlyOrdinals.includes(o.v) ? colors.accent : colors.border}`,
                              background: monthlyOrdinals.includes(o.v) ? colors.accent : "#fff",
                              color: monthlyOrdinals.includes(o.v) ? "#fff" : colors.textSecondary,
                            }}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <Field label="Repeat until"><input style={inputStyle} type="date" required value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} /></Field>
          </div>
        )}

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy || !spaceId}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function toDateInput(date) {
  return new Date(date).toISOString().slice(0, 10);
}
function hhmm(datetimeLocal) {
  return datetimeLocal.slice(11, 16);
}

function ModalShell({ children, onCancel, width }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, overflowY: "auto", padding: 24 }} onClick={onCancel}>
      <div style={{ width, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }} onClick={(e) => e.stopPropagation()}>
        {children}
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
