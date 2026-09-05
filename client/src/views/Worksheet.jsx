import React, { useState, useEffect, useCallback } from "react";
import { colors, card, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";
import { icons } from "../lib/icons";
import DataList from "../components/DataList";
import Modal from "../components/Modal";
import { useIsMobile } from "../lib/viewport";
import { useConfirm } from "../lib/ConfirmContext";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_HISTORY_DAYS = 90;

// Backdated entries are stored as UTC midnight with no real time-of-day —
// show just the date for those instead of a misleading local midnight.
function formatEntryDate(dateStr) {
  const d = new Date(dateStr);
  const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return isDateOnly ? d.toLocaleDateString(undefined, { timeZone: "UTC" }) : d.toLocaleString();
}

export default function Worksheet({ deals, onSaved }) {
  const isMobile = useIsMobile();
  const active = deals.filter((d) => d.status === "active");
  const [inputs, setInputs] = useState({}); // { [dealId]: { ticketsSold, cashPaid } }
  const [entryDate, setEntryDate] = useState(todayStr);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyFrom, setHistoryFrom] = useState(() => daysAgoStr(DEFAULT_HISTORY_DAYS));
  const [historyTo, setHistoryTo] = useState(todayStr);
  const [historyGameId, setHistoryGameId] = useState(""); // "" = all games
  const [editingEntry, setEditingEntry] = useState(null); // a history row, or null
  const [historyActionError, setHistoryActionError] = useState("");
  const [printBusy, setPrintBusy] = useState(false);
  const confirm = useConfirm();

  // Bounded at the database level (see the /daily-sales route) so this pulls
  // a 90-day window by default instead of an org's entire sales history —
  // widening the date range re-queries rather than filtering a huge already-
  // fetched set. The game filter is purely client-side since it doesn't
  // change how much data needs to be fetched, just which rows are shown.
  const loadHistory = useCallback(() => {
    Promise.all(
      deals.map((d) =>
        api.listDailySales(d.id, { from: historyFrom, to: historyTo }).then((rows) => rows.map((r) => ({ ...r, dealName: d.name })))
      )
    )
      .then((lists) => lists.flat().sort((a, b) => new Date(b.date) - new Date(a.date)))
      .then(setHistory)
      .catch(() => {});
  }, [deals, historyFrom, historyTo]);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals.length, historyFrom, historyTo]);

  const filteredHistory = historyGameId ? history.filter((h) => h.dealId === historyGameId) : history;

  // Only shown once the member has actually narrowed the view beyond the
  // default — i.e. whatever the Reset button above would clear — since a
  // total across the default 90-day/all-games window isn't a number anyone
  // asked for.
  const isHistoryFiltered = historyGameId !== "" || historyFrom !== daysAgoStr(DEFAULT_HISTORY_DAYS) || historyTo !== todayStr();
  const historyTotals = filteredHistory.reduce(
    (acc, h) => {
      acc.ticketsSold += h.ticketsSold;
      acc.cashPaid += h.cashPaid;
      acc.cashCollected += h.cashCollected;
      acc.profitLoss += h.profitLoss;
      return acc;
    },
    { ticketsSold: 0, cashPaid: 0, cashCollected: 0, profitLoss: 0 }
  );
  const historyCols = "1.2fr 1.1fr 0.9fr 0.9fr 0.9fr 0.9fr";

  function resetHistoryFilters() {
    setHistoryFrom(daysAgoStr(DEFAULT_HISTORY_DAYS));
    setHistoryTo(todayStr());
    setHistoryGameId("");
  }

  async function deleteEntry(h) {
    const ok = await confirm(
      `Delete this entry for "${h.dealName}" — ${h.ticketsSold} tickets sold, ${money(h.cashPaid)} cash paid on ${formatEntryDate(h.date)}? This can't be undone.`,
      { confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    setHistoryActionError("");
    try {
      await api.deleteDailySale(h.dealId, h.id);
      loadHistory();
      onSaved();
    } catch (err) {
      setHistoryActionError(err.message);
    }
  }

  // Prints exactly what's currently filtered/shown on screen — same game
  // and date-range selection — as a formatted PDF, for members who'll only
  // ever see a paper copy of this. Server-side query mirrors loadHistory's
  // own, so the paper report always matches what was just reviewed here.
  async function printReport() {
    setPrintBusy(true);
    setHistoryActionError("");
    try {
      await api.downloadDailySalesReport({ dealId: historyGameId || undefined, from: historyFrom, to: historyTo });
    } catch (err) {
      setHistoryActionError(err.message);
    } finally {
      setPrintBusy(false);
    }
  }

  function setField(dealId, field, value) {
    setInputs((prev) => ({ ...prev, [dealId]: { ...prev[dealId], [field]: value } }));
    setSaved(false);
  }

  function rowFor(deal) {
    const row = inputs[deal.id] || {};
    const ticketsSold = Number(row.ticketsSold) || 0;
    const cashPaid = Number(row.cashPaid) || 0;
    const cashCollected = ticketsSold * deal.ticketPrice;
    const profitLoss = cashCollected - cashPaid;
    return { ticketsSold, cashPaid, cashCollected, profitLoss };
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const entries = active.filter((d) => {
        const row = inputs[d.id];
        return row && (Number(row.ticketsSold) > 0 || Number(row.cashPaid) > 0);
      });
      const dateOverride = entryDate !== todayStr() ? entryDate : undefined;
      for (const d of entries) {
        const row = rowFor(d);
        await api.saveDailySale(d.id, {
          ticketsSold: row.ticketsSold,
          cashPaid: row.cashPaid,
          ...(dateOverride ? { date: dateOverride } : {}),
        });
      }
      setInputs({});
      setEntryDate(todayStr());
      setSaved(true);
      onSaved();
      loadHistory();
    } catch (err) {
      setError(err.message || "Failed to save entries");
    } finally {
      setSaving(false);
    }
  }

  const cols = "1.6fr 1fr 1fr 1fr 1fr";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "14px 18px" }}>
        <div>
          <label htmlFor="entry-date" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary, display: "block", marginBottom: 4 }}>
            Entry date
          </label>
          <input
            id="entry-date"
            type="date"
            style={{ ...inputStyle, width: 170 }}
            value={entryDate}
            max={todayStr()}
            onChange={(e) => setEntryDate(e.target.value)}
          />
        </div>
        <div style={{ fontSize: 12, color: colors.textSecondary, maxWidth: 360, lineHeight: 1.5 }}>
          Defaults to today. If you're logging a machine check from a previous visit, set the date it actually happened.
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <DataList
          rows={active}
          emptyMessage="No active games."
          columns={[
            {
              key: "game", label: "Game", grid: "1.6fr", primary: true,
              render: (d) => (
                <>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 400, color: colors.textSecondary, fontFamily: mono, marginTop: 1 }}>
                    {d.soldToDate.toLocaleString()} / {d.ticketCount.toLocaleString()} sold
                  </div>
                </>
              ),
            },
            {
              key: "ticketsSold", label: "Tickets sold", grid: "1fr",
              render: (d) => (
                <input
                  style={{ ...inputStyle, width: 100 }}
                  type="number"
                  min="0"
                  placeholder="0"
                  value={inputs[d.id]?.ticketsSold ?? ""}
                  onChange={(e) => setField(d.id, "ticketsSold", e.target.value)}
                />
              ),
            },
            {
              key: "cashPaid", label: "Cash paid", grid: "1fr",
              render: (d) => (
                <input
                  style={{ ...inputStyle, width: 100 }}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={inputs[d.id]?.cashPaid ?? ""}
                  onChange={(e) => setField(d.id, "cashPaid", e.target.value)}
                />
              ),
            },
            { key: "cashCollected", label: "Cash collected", grid: "1fr", render: (d) => <div style={{ fontFamily: mono }}>{money(rowFor(d).cashCollected)}</div> },
            {
              key: "profitLoss", label: "Profit / loss", grid: "1fr",
              render: (d) => {
                const row = rowFor(d);
                return (
                  <div style={{ fontFamily: mono, fontWeight: 600, color: row.profitLoss >= 0 ? colors.success : colors.danger }}>
                    {row.profitLoss >= 0 ? "+" : ""}
                    {money(row.profitLoss)}
                  </div>
                );
              },
            },
          ]}
        />

        {active.length > 0 && (() => {
          const totals = active.reduce(
            (acc, d) => {
              const r = rowFor(d);
              acc.collected += r.cashCollected;
              acc.profit += r.profitLoss;
              return acc;
            },
            { collected: 0, profit: 0 }
          );
          return isMobile ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5, fontWeight: 700 }}>
              <div>Total</div>
              <div style={{ textAlign: "right", fontFamily: mono }}>
                <div>{money(totals.collected)}</div>
                <div style={{ color: totals.profit >= 0 ? colors.success : colors.danger }}>
                  {totals.profit >= 0 ? "+" : ""}
                  {money(totals.profit)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 18px", alignItems: "center", fontSize: 13.5, fontWeight: 700 }}>
              <div>Total</div>
              <div />
              <div />
              <div style={{ fontFamily: mono }}>{money(totals.collected)}</div>
              <div style={{ fontFamily: mono, color: totals.profit >= 0 ? colors.success : colors.danger }}>
                {totals.profit >= 0 ? "+" : ""}
                {money(totals.profit)}
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        {error && <span style={{ color: colors.danger, fontSize: 12.5, fontWeight: 600 }}>{error}</span>}
        {saved && <span style={{ color: colors.success, fontSize: 12.5, fontWeight: 600 }}>✓ Saved</span>}
        <button style={button.primary} onClick={save} disabled={saving || active.length === 0}>
          {saving ? "Saving…" : "Save entries"}
        </button>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Recent entries</div>
          <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", gap: 10, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
            {/* Reported as easy to miss on a quick glance — nothing marked
                these controls as filters on the table below, as opposed to
                some other kind of setting. A labeled icon ahead of the first
                field makes that unambiguous at a glance. */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: colors.textSecondary, alignSelf: isMobile ? "flex-start" : "flex-end", paddingBottom: isMobile ? 0 : 8 }}>
              <span dangerouslySetInnerHTML={{ __html: icons.filter }} style={{ width: 14, height: 14, display: "flex" }} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Filters</span>
            </div>
            <Field label="Game">
              <select style={{ ...inputStyle, width: isMobile ? "100%" : 170 }} value={historyGameId} onChange={(e) => setHistoryGameId(e.target.value)}>
                <option value="">All games</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="From">
              <input style={{ ...inputStyle, width: isMobile ? "100%" : 145 }} type="date" value={historyFrom} max={historyTo} onChange={(e) => setHistoryFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input style={{ ...inputStyle, width: isMobile ? "100%" : 145 }} type="date" value={historyTo} min={historyFrom} max={todayStr()} onChange={(e) => setHistoryTo(e.target.value)} />
            </Field>
            <button style={button.ghost} onClick={resetHistoryFilters}>Reset</button>
            {/* Prints exactly this filtered view as a formatted PDF — for
                members who'll only ever see a paper copy of the worksheet,
                not the screen itself. */}
            <button style={button.secondary} onClick={printReport} disabled={printBusy || filteredHistory.length === 0}>
              {printBusy ? "Preparing…" : "Print report (PDF)"}
            </button>
          </div>
        </div>
        {historyActionError && (
          <div style={{ padding: "10px 18px 0", color: colors.danger, fontSize: 12.5, fontWeight: 600 }}>{historyActionError}</div>
        )}
        <DataList
          rows={filteredHistory}
          emptyMessage={history.length === 0 ? "No entries in this date range." : "No entries for this game in this date range."}
          columns={[
            { key: "date", label: "Date & time", grid: "1.2fr", render: (h) => <div style={{ fontFamily: mono, fontSize: 12 }}>{formatEntryDate(h.date)}</div> },
            { key: "game", label: "Game", grid: "1.1fr", primary: true, render: (h) => h.dealName },
            { key: "ticketsSold", label: "Tickets sold", grid: "0.9fr", render: (h) => <div style={{ fontFamily: mono }}>{h.ticketsSold}</div> },
            { key: "cashPaid", label: "Cash paid", grid: "0.9fr", render: (h) => <div style={{ fontFamily: mono }}>{money(h.cashPaid)}</div> },
            { key: "cashCollected", label: "Cash collected", grid: "0.9fr", render: (h) => <div style={{ fontFamily: mono }}>{money(h.cashCollected)}</div> },
            {
              key: "profitLoss", label: "Profit / loss", grid: "0.9fr",
              render: (h) => (
                <div style={{ fontFamily: mono, fontWeight: 600, color: h.profitLoss >= 0 ? colors.success : colors.danger }}>
                  {h.profitLoss >= 0 ? "+" : ""}
                  {money(h.profitLoss)}
                </div>
              ),
            },
            {
              key: "actions", label: "", grid: "0.9fr", footerRow: true,
              // A closed game's entries are locked server-side (see deals.js's
              // daily-sales PATCH/DELETE routes) — same reasoning as the game
              // record itself being locked once Schedule 1 closes it out, so
              // no edit/delete controls are offered for those rows at all.
              render: (h) => {
                const deal = deals.find((d) => d.id === h.dealId);
                if (!deal || deal.status === "closed") return null;
                return (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingEntry(h)}>Edit</button>
                    <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={() => deleteEntry(h)}>Delete</button>
                  </div>
                );
              },
            },
          ]}
        />

        {isHistoryFiltered && filteredHistory.length > 0 && (
          isMobile ? (
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}` }}>
              <div style={{ padding: "10px 14px", background: colors.border, border: `1px solid ${colors.borderStrong}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, fontWeight: 700 }}>
                <div>Total</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 400 }}>
                  <span style={{ color: colors.textSecondary }}>Tickets sold</span>
                  <span style={{ fontFamily: mono, fontWeight: 700 }}>{historyTotals.ticketsSold.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 400 }}>
                  <span style={{ color: colors.textSecondary }}>Cash paid</span>
                  <span style={{ fontFamily: mono, fontWeight: 700 }}>{money(historyTotals.cashPaid)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 400 }}>
                  <span style={{ color: colors.textSecondary }}>Cash collected</span>
                  <span style={{ fontFamily: mono, fontWeight: 700 }}>{money(historyTotals.cashCollected)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 400 }}>
                  <span style={{ color: colors.textSecondary }}>Profit / loss</span>
                  <span style={{ fontFamily: mono, fontWeight: 700, color: historyTotals.profitLoss >= 0 ? colors.success : colors.danger }}>
                    {historyTotals.profitLoss >= 0 ? "+" : ""}
                    {money(historyTotals.profitLoss)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}` }}>
              <div style={{ display: "grid", gridTemplateColumns: historyCols, padding: "10px 14px", alignItems: "center", fontSize: 13.5, fontWeight: 700, background: colors.border, border: `1px solid ${colors.borderStrong}`, borderRadius: 8 }}>
                <div>Total</div>
                <div />
                <div style={{ fontFamily: mono }}>{historyTotals.ticketsSold.toLocaleString()}</div>
                <div style={{ fontFamily: mono }}>{money(historyTotals.cashPaid)}</div>
                <div style={{ fontFamily: mono }}>{money(historyTotals.cashCollected)}</div>
                <div style={{ fontFamily: mono, color: historyTotals.profitLoss >= 0 ? colors.success : colors.danger }}>
                  {historyTotals.profitLoss >= 0 ? "+" : ""}
                  {money(historyTotals.profitLoss)}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          deal={deals.find((d) => d.id === editingEntry.dealId)}
          onCancel={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null);
            loadHistory();
            onSaved();
          }}
        />
      )}
    </div>
  );
}

// Corrects a single already-saved worksheet entry (wrong tickets sold, cash
// paid, or backdated date) — reported directly: once an entry was saved
// there was no way to fix a mistake short of it silently skewing the
// game's running totals forever. Mirrors EditGameModal's (Deals.jsx) shape
// and error handling.
function EditEntryModal({ entry, deal, onCancel, onSaved }) {
  const [ticketsSold, setTicketsSold] = useState(String(entry.ticketsSold));
  const [cashPaid, setCashPaid] = useState(String(entry.cashPaid));
  const [date, setDate] = useState(new Date(entry.date).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.updateDailySale(entry.dealId, entry.id, { ticketsSold: Number(ticketsSold), cashPaid: Number(cashPaid), date });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const cashCollected = (Number(ticketsSold) || 0) * (deal?.ticketPrice || 0);
  const profitLoss = cashCollected - (Number(cashPaid) || 0);

  return (
    <Modal onCancel={onCancel} width={380} title={`Correct entry — ${entry.dealName}`}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Entry date">
          <input style={inputStyle} type="date" required value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Tickets sold">
          <input style={inputStyle} type="number" min="0" required value={ticketsSold} onChange={(e) => setTicketsSold(e.target.value)} />
        </Field>
        <Field label="Cash paid">
          <input style={inputStyle} type="number" min="0" step="0.01" required value={cashPaid} onChange={(e) => setCashPaid(e.target.value)} />
        </Field>
        <div style={{ fontSize: 12, color: colors.textSecondary, display: "flex", justifyContent: "space-between" }}>
          <span>Cash collected: <strong style={{ fontFamily: mono, color: colors.textPrimary }}>{money(cashCollected)}</strong></span>
          <span>Profit/loss: <strong style={{ fontFamily: mono, color: profitLoss >= 0 ? colors.success : colors.danger }}>{profitLoss >= 0 ? "+" : ""}{money(profitLoss)}</strong></span>
        </div>
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
