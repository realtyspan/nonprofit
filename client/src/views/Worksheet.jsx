import React, { useState, useEffect, useCallback } from "react";
import { colors, card, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";

export default function Worksheet({ deals, onSaved }) {
  const active = deals.filter((d) => d.status === "active");
  const [inputs, setInputs] = useState({}); // { [dealId]: { ticketsSold, cashPaid } }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(() => {
    Promise.all(
      deals.map((d) => api.listDailySales(d.id).then((rows) => rows.map((r) => ({ ...r, dealName: d.name }))))
    )
      .then((lists) => lists.flat().sort((a, b) => new Date(b.date) - new Date(a.date)))
      .then(setHistory)
      .catch(() => {});
  }, [deals]);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals.length]);

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
      for (const d of entries) {
        const row = rowFor(d);
        await api.saveDailySale(d.id, { ticketsSold: row.ticketsSold, cashPaid: row.cashPaid });
      }
      setInputs({});
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
              <div style={{ fontWeight: 600 }}>{d.name}</div>
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
        {saved && <span style={{ color: colors.success, fontSize: 12.5, fontWeight: 600 }}>✓ Saved to daily log</span>}
        <button style={button.primary} onClick={save} disabled={saving || active.length === 0}>
          {saving ? "Saving…" : "Save today's entries"}
        </button>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>Recent entries</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1fr 1fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Date &amp; time</div>
          <div>Game</div>
          <div>Tickets sold</div>
          <div>Cash paid</div>
          <div>Cash collected</div>
          <div>Profit / loss</div>
        </div>
        {history.map((h) => (
          <div key={h.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1fr 1fr", padding: "10px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13, alignItems: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 12 }}>{new Date(h.date).toLocaleString()}</div>
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
        {history.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No entries logged yet.</div>}
      </div>
    </div>
  );
}
