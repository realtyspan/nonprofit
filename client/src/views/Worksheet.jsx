import React, { useState, useEffect, useCallback } from "react";
import { colors, card, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";

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

  function resetHistoryFilters() {
    setHistoryFrom(daysAgoStr(DEFAULT_HISTORY_DAYS));
    setHistoryTo(todayStr());
    setHistoryGameId("");
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
        <div style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary, borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>Game</div>
          <div>Tickets sold</div>
          <div>Cash paid</div>
          <div>Cash collected</div>
          <div>Profit / loss</div>
        </div>

        {active.map((d) => {
          const row = rowFor(d);
          return (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 18px", alignItems: "center", borderBottom: `1px solid ${colors.borderLight}`, fontSize: 13.5 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily: mono, marginTop: 1 }}>
                  {d.soldToDate.toLocaleString()} / {d.ticketCount.toLocaleString()} sold
                </div>
              </div>
              <input
                style={inputStyle}
                type="number"
                min="0"
                placeholder="0"
                value={inputs[d.id]?.ticketsSold ?? ""}
                onChange={(e) => setField(d.id, "ticketsSold", e.target.value)}
              />
              <input
                style={inputStyle}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={inputs[d.id]?.cashPaid ?? ""}
                onChange={(e) => setField(d.id, "cashPaid", e.target.value)}
              />
              <div style={{ fontFamily: mono }}>{money(row.cashCollected)}</div>
              <div style={{ fontFamily: mono, fontWeight: 600, color: row.profitLoss >= 0 ? colors.success : colors.danger }}>
                {row.profitLoss >= 0 ? "+" : ""}
                {money(row.profitLoss)}
              </div>
            </div>
          );
        })}

        {active.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No active games.</div>}

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
          return (
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Recent entries</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <Field label="Game">
              <select style={{ ...inputStyle, width: 170 }} value={historyGameId} onChange={(e) => setHistoryGameId(e.target.value)}>
                <option value="">All games</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="From">
              <input style={{ ...inputStyle, width: 145 }} type="date" value={historyFrom} max={historyTo} onChange={(e) => setHistoryFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input style={{ ...inputStyle, width: 145 }} type="date" value={historyTo} min={historyFrom} max={todayStr()} onChange={(e) => setHistoryTo(e.target.value)} />
            </Field>
            <button style={button.ghost} onClick={resetHistoryFilters}>Reset</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1fr 1fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Date &amp; time</div>
          <div>Game</div>
          <div>Tickets sold</div>
          <div>Cash paid</div>
          <div>Cash collected</div>
          <div>Profit / loss</div>
        </div>
        {filteredHistory.map((h) => (
          <div key={h.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1fr 1fr", padding: "10px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13, alignItems: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 12 }}>{formatEntryDate(h.date)}</div>
            <div style={{ fontWeight: 600 }}>{h.dealName}</div>
            <div style={{ fontFamily: mono }}>{h.ticketsSold}</div>
            <div style={{ fontFamily: mono }}>{money(h.cashPaid)}</div>
            <div style={{ fontFamily: mono }}>{money(h.cashCollected)}</div>
            <div style={{ fontFamily: mono, fontWeight: 600, color: h.profitLoss >= 0 ? colors.success : colors.danger }}>
              {h.profitLoss >= 0 ? "+" : ""}
              {money(h.profitLoss)}
            </div>
          </div>
        ))}
        {filteredHistory.length === 0 && (
          <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>
            {history.length === 0 ? "No entries in this date range." : "No entries for this game in this date range."}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
