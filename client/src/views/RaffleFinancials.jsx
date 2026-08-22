import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";
import { formatUtcDate } from "../lib/dates";
import ReceiptField from "../components/ReceiptField";
import DataList from "../components/DataList";
import { useIsMobile } from "../lib/viewport";

const EXPENSE_CATEGORIES = [
  { value: "tickets", label: "Tickets" },
  { value: "license_fee", label: "License Fee" },
  { value: "equipment_supplies", label: "Raffle Equipment & Supplies" },
  { value: "services", label: "Services" },
  { value: "rent", label: "Rent" },
  { value: "other", label: "Other" },
];
const CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

const CATEGORY_META = {
  category_2: { label: "Category 2", bg: colors.successBg, color: colors.success, blurb: "Net proceeds under $5,000 — minimal, self-certifying filing." },
  category_1b: { label: "Category 1B", bg: colors.warningBg, color: colors.warning, blurb: "Net proceeds $5,000–$29,999 — file a verified statement (GCVS-1)." },
  category_1a: { label: "Category 1A", bg: "#fee2e2", color: colors.danger, blurb: "Net proceeds $30,000+ — GC-7R Financial Statement due within 30 days of each raffle occasion, plus a 2% fee on the amount over $30,000." },
};

function currentYear() {
  return new Date().getFullYear();
}

export default function RaffleFinancials() {
  const [year, setYear] = useState(currentYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    api.getRaffleFinancials(year).then(setData).catch((err) => setError(err.message));
  }
  useEffect(refresh, [year]);

  if (error) {
    return <div style={{ ...card, fontSize: 13, color: colors.danger }}>{error}</div>;
  }
  if (!data) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>Loading…</div>;
  }

  const f = data.financials;
  const meta = CATEGORY_META[f.category];
  const showProjection = f.categoryProjected !== f.category || f.netProceedsProjected !== f.netProceedsActual;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={button.ghost} onClick={() => setYear((y) => y - 1)}>← {year - 1}</button>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{year}</div>
          <button style={button.ghost} onClick={() => setYear((y) => y + 1)}>{year + 1} →</button>
        </div>
        <button style={button.ghost} onClick={() => setYear(currentYear())}>This year</button>
      </div>

      <div style={{ ...card, background: meta.bg, border: `1px solid ${meta.color}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={pill(meta.color, "#fff")}>{meta.label}</span>
          <div style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>
            {money(f.netProceedsActual)} net proceeds year-to-date
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: meta.color }}>{meta.blurb}</div>
        {f.category === "category_1a" && (
          <div style={{ fontSize: 12.5, color: meta.color, marginTop: 4 }}>
            Estimated additional license fee: <strong>{money(f.additionalFee)}</strong> (2% of the amount over $30,000)
          </div>
        )}
        {showProjection && (
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${meta.color}33` }}>
            Projected (using estimated expenses where actuals aren't entered yet): {money(f.netProceedsProjected)} —{" "}
            <span style={{ fontWeight: 700 }}>{CATEGORY_META[f.categoryProjected].label}</span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <SummaryCard label="Total receipts" value={f.totalReceipts} />
        <SummaryCard label="Total prize value" value={f.totalPrizeValue} sub="from Drawings" />
        <SummaryCard label="Total expenses" value={f.totalActualExpenses} />
        <SummaryCard label="Net proceeds" value={f.netProceedsActual} />
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: colors.textSecondary, letterSpacing: ".03em" }}>
        Raffles in {year}
      </div>

      {data.games.length === 0 && (
        <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No raffles with a closing date in {year}.</div>
      )}
      {data.games.map((g) => (
        <GameFinancialCard key={g.gameId} game={g} onChanged={refresh} />
      ))}
    </div>
  );
}

function GameFinancialCard({ game, onChanged }) {
  const isMobile = useIsMobile();
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", payee: "", checkNum: "", amount: "", category: "tickets", receiptFile: "", receiptFileName: "" });
  const [estimate, setEstimate] = useState(String(game.estimatedExpenses));
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [error, setError] = useState("");

  function refreshExpenses() {
    api.listRaffleExpenses(game.gameId).then(setExpenses).catch(() => {});
  }
  useEffect(refreshExpenses, [game.gameId]);
  useEffect(() => setEstimate(String(game.estimatedExpenses)), [game.estimatedExpenses]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createRaffleExpense(game.gameId, { ...form, amount: Number(form.amount) });
      setForm({ date: "", payee: "", checkNum: "", amount: "", category: "tickets", receiptFile: "", receiptFileName: "" });
      setShowForm(false);
      refreshExpenses();
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await api.deleteRaffleExpense(game.gameId, id);
      refreshExpenses();
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEstimate() {
    setSavingEstimate(true);
    setError("");
    try {
      await api.updateRaffleEstimatedExpenses(game.gameId, Number(estimate) || 0);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEstimate(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{game.name}</div>
          <div style={{ fontSize: 12, color: colors.textSecondary }}>
            Closes {formatUtcDate(game.raffleEndDate)} · Receipts {money(game.revenue)} · Prizes {money(game.totalPrizeValue)} · Expenses {money(game.actualExpenses)}
          </div>
        </div>
        <button style={button.ghost} onClick={() => setShowForm((s) => !s)}>{showForm ? "− Cancel" : "+ Add expense"}</button>
      </div>

      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#52525b", width: isMobile ? "100%" : undefined }}>
          Estimated non-prize expenses (planning only)
          <input style={{ ...inputStyle, width: isMobile ? "100%" : 140 }} type="number" step="0.01" min="0" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
        </label>
        <button style={button.ghost} disabled={savingEstimate} onClick={saveEstimate}>{savingEstimate ? "Saving…" : "Save estimate"}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
            <Field label="Date"><input style={inputStyle} type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Payee"><input style={inputStyle} required value={form.payee} onChange={(e) => set("payee", e.target.value)} /></Field>
            <Field label="Check #"><input style={inputStyle} value={form.checkNum} onChange={(e) => set("checkNum", e.target.value)} /></Field>
            <Field label="Amount"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
            <Field label="Category">
              <select style={inputStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={button.primary} type="submit">Add</button>
          </div>
          <ReceiptField
            receiptFile={form.receiptFile}
            receiptFileName={form.receiptFileName}
            onChange={({ receiptFile, receiptFileName }) => setForm((f) => ({ ...f, receiptFile, receiptFileName }))}
          />
        </form>
      )}
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 10, overflow: "hidden" }}>
        <DataList
          rows={expenses}
          emptyMessage="No expenses recorded yet."
          columns={[
            { key: "date", label: "Date", grid: "1fr", render: (e) => <span style={{ fontFamily: mono }}>{formatUtcDate(e.date)}</span> },
            { key: "payee", label: "Payee", grid: "1.6fr", primary: true, render: (e) => e.payee },
            { key: "check", label: "Check #", grid: "1fr", render: (e) => <span style={{ fontFamily: mono }}>{e.checkNum}</span> },
            { key: "amount", label: "Amount", grid: "1fr", render: (e) => <span style={{ fontFamily: mono }}>{money(e.amount)}</span> },
            { key: "category", label: "Category", grid: "1.3fr", render: (e) => <span style={pill("#f0f0f3", colors.textSecondary)}>{CATEGORY_LABEL[e.category] || e.category}</span> },
            {
              key: "receipt", label: "Receipt", grid: "0.7fr",
              render: (e) => e.receiptFile ? (
                <a href={e.receiptFile} download={e.receiptFileName || "receipt"} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: colors.accent, fontWeight: 600 }}>
                  {e.receiptFile.startsWith("data:image/") ? "🖼 View" : "📄 View"}
                </a>
              ) : (
                <span style={{ color: colors.textTertiary, fontSize: 12.5 }}>—</span>
              ),
            },
            {
              key: "actions", label: "", grid: "auto", fullWidthOnMobile: true,
              render: (e) => <button style={{ ...button.ghost, padding: "4px 10px", fontSize: 11.5, color: colors.danger }} onClick={() => deleteExpense(e.id)}>Delete</button>,
            },
          ]}
        />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: mono, marginTop: 6 }}>{money(value)}</div>
      {sub && <div style={{ fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
