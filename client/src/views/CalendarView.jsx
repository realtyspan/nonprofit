import React, { useEffect, useState, useCallback } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import CalendarGrid from "../components/CalendarGrid";
import PublicLinkBox from "../components/PublicLinkBox";

const WEEKDAYS = [
  { key: "SU", label: "S" }, { key: "MO", label: "M" }, { key: "TU", label: "T" }, { key: "WE", label: "W" },
  { key: "TH", label: "T" }, { key: "FR", label: "F" }, { key: "SA", label: "S" },
];
const WEEKDAY_FULL = [
  { key: "SU", label: "Sunday" }, { key: "MO", label: "Monday" }, { key: "TU", label: "Tuesday" }, { key: "WE", label: "Wednesday" },
  { key: "TH", label: "Thursday" }, { key: "FR", label: "Friday" }, { key: "SA", label: "Saturday" },
];
const ORDINALS = [{ v: 1, label: "1st" }, { v: 2, label: "2nd" }, { v: 3, label: "3rd" }, { v: 4, label: "4th" }, { v: -1, label: "Last" }];

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

export default function CalendarView({ rentalSpaces = [], permissions }) {
  const canManageRentals = permissions?.orgTier === "Owner" || permissions?.moduleGrants?.rentals === "Admin";
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [formState, setFormState] = useState(null); // { mode: "new"|"editOne"|"editSeries", event?, defaultDate? }
  const [detailEvent, setDetailEvent] = useState(null);

  const refresh = useCallback(() => {
    const rangeStart = new Date(month.getFullYear(), month.getMonth(), -7);
    const rangeEnd = new Date(month.getFullYear(), month.getMonth() + 1, 7);
    api.listCalendarEvents(rangeStart, rangeEnd).then(setEvents).catch(() => {});
  }, [month]);

  useEffect(refresh, [refresh]);

  function changeMonth(delta) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PublicLinkBox basePath="calendar" embedBasePath="calendar/embed" embedTitle="Calendar" description="Set a link so you can view or embed this calendar (public events only) on your website." />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={button.primary} onClick={() => setFormState({ mode: "new" })}>+ Add event</button>
      </div>

      <CalendarGrid
        month={month}
        events={events}
        onPrevMonth={() => changeMonth(-1)}
        onNextMonth={() => changeMonth(1)}
        onSelectDay={(day) => setFormState({ mode: "new", defaultDate: day })}
        onSelectEvent={(e) => setDetailEvent(e)}
      />

      <div style={{ fontSize: 11.5, color: colors.textSecondary, display: "flex", gap: 16 }}>
        <Legend color={colors.successBg} label="Lodge events" />
        <Legend color={colors.indigoBg} label="Rental bookings" />
        <Legend color="#f0f0f3" label="Internal holds" />
      </div>

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          rentalSpaces={rentalSpaces}
          onClose={() => setDetailEvent(null)}
          onEdit={(mode) => { setFormState({ mode, event: detailEvent }); setDetailEvent(null); }}
          onDeleted={() => { setDetailEvent(null); refresh(); }}
        />
      )}

      {formState && (
        <EventFormModal
          state={formState}
          rentalSpaces={rentalSpaces}
          canManageRentals={canManageRentals}
          onCancel={() => setFormState(null)}
          onSaved={() => { setFormState(null); refresh(); }}
        />
      )}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </div>
  );
}

function EventDetailModal({ event, rentalSpaces, onClose, onEdit, onDeleted }) {
  const isManual = event.source === "manual";
  const isRecurring = !!event.recurrenceId;
  const usedSpaceNames = (event.rentalSpaceIds || [])
    .map((id) => rentalSpaces.find((s) => s.id === id)?.name)
    .filter(Boolean);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function deleteOne() {
    setBusy(true);
    try {
      await api.deleteCalendarEvent(event.id);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }
  async function deleteSeries() {
    setBusy(true);
    try {
      await api.deleteCalendarRecurrence(event.recurrenceId);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onCancel={onClose} width={380}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{event.title}</div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 4 }}>
        {new Date(event.startAt).toLocaleString()} – {new Date(event.endAt).toLocaleTimeString()}
      </div>
      {event.location && (
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 4 }}>📍 {event.location}</div>
      )}
      {event.description && (
        <div style={{ fontSize: 13, marginBottom: 10, whiteSpace: "pre-wrap" }}>{event.description}</div>
      )}
      {event.linkUrl && (
        <div style={{ marginBottom: 10 }}>
          <a href={event.linkUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: colors.accent, fontWeight: 600 }}>
            More info ↗
          </a>
        </div>
      )}
      {usedSpaceNames.length > 0 && (
        <div style={{ fontSize: 11.5, color: colors.textTertiary, marginBottom: 10 }}>
          Uses: {usedSpaceNames.join(", ")} — shown as unavailable for rental during this time.
        </div>
      )}
      {!isManual && (
        <div style={{ fontSize: 11.5, color: colors.textTertiary, marginBottom: 10 }}>
          Managed by the {event.source === "rental-booking" ? "Rental Space" : "Rental Space"} module — edit it from there.
        </div>
      )}

      {isManual && !confirmDelete && (
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

      {confirmDelete && (
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button style={button.ghost} onClick={onClose}>Close</button>
      </div>
    </ModalShell>
  );
}

function EventFormModal({ state, rentalSpaces, canManageRentals, onCancel, onSaved }) {
  const { mode, event, defaultDate } = state;
  const isSeries = mode === "editSeries";
  const start = defaultDate ? new Date(defaultDate) : event ? new Date(event.startAt) : new Date();
  start.setHours(start.getHours() || 18, start.getMinutes(), 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [location, setLocation] = useState(event?.location || "");
  const [linkUrl, setLinkUrl] = useState(event?.linkUrl || "");
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [startAt, setStartAt] = useState(toLocalInput(event?.startAt || start));
  const [endAt, setEndAt] = useState(toLocalInput(event?.endAt || end));
  const [visibility, setVisibility] = useState(event?.visibility || "internal");
  const [repeats, setRepeats] = useState(mode === "editSeries");
  const [rentalSpaceIds, setRentalSpaceIds] = useState(event?.rentalSpaceIds || []);
  const [freq, setFreq] = useState("weekly");
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
    if (mode === "editSeries" && event?.recurrenceId) {
      api.getCalendarRecurrence(event.recurrenceId).then((rec) => {
        setTitle(rec.title);
        setDescription(rec.description || "");
        setLocation(rec.location || "");
        setLinkUrl(rec.linkUrl || "");
        setAllDay(rec.allDay);
        setVisibility(rec.visibility);
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
  function toggleRentalSpace(id) {
    setRentalSpaceIds((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));
  }

  // Only a genuinely one-off event can block a rental space — a recurring
  // room commitment already has its own tool (Rental Space > Internal
  // Blocks recurrence), so this option is hidden for anything repeating.
  const isOneOff = !repeats && mode !== "editSeries" && !event?.recurrenceId;
  const showRentalSpaceOption = isOneOff && canManageRentals && rentalSpaces.length > 0;

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
      const basePayload = { title, description, location, linkUrl, allDay, visibility };
      if (mode === "new" && repeats) {
        await api.createCalendarEvent({
          ...basePayload,
          startAt, endAt,
          recurrence: { ...recurrenceFields(), startDate: startAt.slice(0, 10), endDate: repeatUntil, startTime: hhmm(startAt), endTime: hhmm(endAt) },
        });
      } else if (mode === "new") {
        await api.createCalendarEvent({ ...basePayload, startAt, endAt, rentalSpaceIds: showRentalSpaceOption ? rentalSpaceIds : [] });
      } else if (mode === "editOne") {
        await api.updateCalendarEvent(event.id, { ...basePayload, startAt, endAt, rentalSpaceIds: isOneOff ? rentalSpaceIds : undefined });
      } else if (mode === "editSeries") {
        await api.updateCalendarRecurrence(event.recurrenceId, {
          ...basePayload, ...recurrenceFields(),
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
          {mode === "new" ? "Add event" : mode === "editSeries" ? "Edit entire series" : "Edit event"}
        </div>

        <Field label="Title"><input style={inputStyle} required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Description">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Location (optional)"><input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Leave blank if at the lodge" /></Field>
          <Field label="Link (optional)"><input style={inputStyle} type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" /></Field>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Start"><input style={inputStyle} type="datetime-local" required value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
          <Field label="End"><input style={inputStyle} type="datetime-local" required value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
        </div>

        {showRentalSpaceOption && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={rentalSpaceIds.length > 0} onChange={(e) => setRentalSpaceIds(e.target.checked ? [rentalSpaces[0].id] : [])} />
            This event uses a rental space
          </label>
        )}
        {showRentalSpaceOption && rentalSpaceIds.length > 0 && (
          <div style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b", marginBottom: 8 }}>Which space(s)? Shown as unavailable to renters for this time.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rentalSpaces.map((s) => (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={rentalSpaceIds.includes(s.id)} onChange={() => toggleRentalSpace(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <Field label="Visibility">
          <select style={inputStyle} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="internal">Internal only</option>
            <option value="public">Public (shows on embedded calendar)</option>
          </select>
        </Field>

        {mode === "new" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            Repeats
          </label>
        )}

        {(repeats || mode === "editSeries") && (
          <div style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Frequency">
                <select style={inputStyle} value={freq} onChange={(e) => setFreq(e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
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
              <MonthlyRecurrenceFields
                startAt={startAt} monthlyMode={monthlyMode} setMonthlyMode={setMonthlyMode}
                monthlyWeekday={monthlyWeekday} setMonthlyWeekday={setMonthlyWeekday}
                monthlyOrdinals={monthlyOrdinals} toggleOrdinal={toggleOrdinal}
              />
            )}
            <Field label="Repeat until"><input style={inputStyle} type="date" required value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} /></Field>
          </div>
        )}

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function MonthlyRecurrenceFields({ startAt, monthlyMode, setMonthlyMode, monthlyWeekday, setMonthlyWeekday, monthlyOrdinals, toggleOrdinal }) {
  return (
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
  );
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
