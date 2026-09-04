import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";
import { icons } from "../lib/icons";
import ReceiptField from "../components/ReceiptField";
import DataList from "../components/DataList";
import { useIsMobile } from "../lib/viewport";

const CATEGORY_META = {
  ticket_purchase: { label: "Ticket purchase (A5)", bg: colors.successBg, color: colors.success },
  license_fee: { label: "License fee", bg: colors.warningBg, color: colors.warning },
  indirect: { label: "Indirect disbursement", bg: colors.indigoBg, color: colors.indigo },
};

export default function Ledger() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", payee: "", checkNum: "", amount: "", category: "ticket_purchase", receiptFile: "", receiptFileName: "" });
  const [error, setError] = useState("");
  const [filterCategory, setFilterCategory] = useState(""); // "" = all categories
  const [filterFrom, setFilterFrom] = useState(""); // "" = no lower bound
  const [filterTo, setFilterTo] = useState(""); // "" = no upper bound
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState("");

  function refresh() {
    api.listDisbursements().then(setRows).catch(() => {});
  }
  useEffect(refresh, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Client-side, like Schedule 1's own filter — a checking-account register
  // for one org accumulates slowly enough that filtering the already-
  // fetched list needs no separate server round trip. Defaults to no bound
  // at all, not a rolling window, so nothing in the register is hidden
  // until someone actually narrows it.
  const filteredRows = rows.filter((r) => {
    if (filterCategory && r.category !== filterCategory) return false;
    const d = new Date(r.date);
    if (filterFrom && d < new Date(filterFrom)) return false;
    if (filterTo && d > new Date(`${filterTo}T23:59:59.999`)) return false;
    return true;
  });

  function resetFilters() {
    setFilterCategory("");
    setFilterFrom("");
    setFilterTo("");
  }

  // Prints exactly the filtered category/date range shown on screen — same
  // reasoning as the Sales Worksheet's and Schedule 1's own Print report
  // buttons. The server independently re-queries by the same filter rather
  // than trusting client-side rows.
  async function printReport() {
    setPrintBusy(true);
    setPrintError("");
    try {
      await api.downloadDisbursementsReport({
        category: filterCategory || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
    } catch (err) {
      setPrintError(err.message);
    } finally {
      setPrintBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createDisbursement({ ...form, amount: Number(form.amount) });
      setForm({ date: "", payee: "", checkNum: "", amount: "", category: "ticket_purchase", receiptFile: "", receiptFileName: "" });
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const sums = { ticket_purchase: 0, license_fee: 0, indirect: 0 };
  rows.forEach((r) => { sums[r.category] = (sums[r.category] || 0) + r.amount; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <SummaryCard label="Ticket purchase costs" value={sums.ticket_purchase} />
        <SummaryCard label="License fees paid" value={sums.license_fee} />
        <SummaryCard label="Indirect disbursements" value={sums.indirect} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={button.ghost} onClick={() => setShowForm((s) => !s)}>{showForm ? "− Cancel" : "+ Add transaction"}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, alignItems: "end" }}>
            <Field label="Date"><input style={inputStyle} type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Payee"><input style={inputStyle} required value={form.payee} onChange={(e) => set("payee", e.target.value)} /></Field>
            <Field label="Check #"><input style={inputStyle} required value={form.checkNum} onChange={(e) => set("checkNum", e.target.value)} /></Field>
            <Field label="Amount"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
            <Field label="Category">
              <select style={inputStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="ticket_purchase">Ticket purchase (A5)</option>
                <option value="license_fee">License fee</option>
                <option value="indirect">Indirect disbursement</option>
              </select>
            </Field>
            <button style={button.primary} type="submit">Add</button>
          </div>
          <ReceiptField
            receiptFile={form.receiptFile}
            receiptFileName={form.receiptFileName}
            onChange={({ receiptFile, receiptFileName }) => setForm((f) => ({ ...f, receiptFile, receiptFileName }))}
          />
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        </form>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: colors.textSecondary, alignSelf: isMobile ? "flex-start" : "flex-end", paddingBottom: isMobile ? 0 : 8 }}>
            <span dangerouslySetInnerHTML={{ __html: icons.filter }} style={{ width: 14, height: 14, display: "flex" }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Filters</span>
          </div>
          <Field label="Category">
            <select style={{ ...inputStyle, width: isMobile ? "100%" : 190 }} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">All categories</option>
              <option value="ticket_purchase">Ticket purchase (A5)</option>
              <option value="license_fee">License fee</option>
              <option value="indirect">Indirect disbursement</option>
            </select>
          </Field>
          <Field label="From">
            <input style={{ ...inputStyle, width: isMobile ? "100%" : 145 }} type="date" value={filterFrom} max={filterTo || undefined} onChange={(e) => setFilterFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input style={{ ...inputStyle, width: isMobile ? "100%" : 145 }} type="date" value={filterTo} min={filterFrom || undefined} onChange={(e) => setFilterTo(e.target.value)} />
          </Field>
          <button style={button.ghost} onClick={resetFilters}>Reset</button>
          {/* Prints exactly this filtered category/date range as a
              formatted PDF — for members who'll only ever see a paper
              copy of this register, not the screen itself. */}
          <button style={button.secondary} onClick={printReport} disabled={printBusy || filteredRows.length === 0}>
            {printBusy ? "Preparing…" : "Print report (PDF)"}
          </button>
        </div>
        {printError && <div style={{ padding: "10px 18px 0", color: colors.danger, fontSize: 12.5, fontWeight: 600 }}>{printError}</div>}
        <DataList
          rows={filteredRows}
          emptyMessage={rows.length === 0 ? "No transactions yet." : "No transactions match this filter."}
          columns={[
            { key: "date", label: "Date", grid: "1fr", render: (r) => <span style={{ fontFamily: mono }}>{new Date(r.date).toLocaleDateString(undefined, { timeZone: "UTC" })}</span> },
            { key: "payee", label: "Payee", grid: "1.6fr", primary: true, render: (r) => r.payee },
            { key: "check", label: "Check #", grid: "1fr", render: (r) => <span style={{ fontFamily: mono }}>{r.checkNum}</span> },
            { key: "amount", label: "Amount", grid: "1fr", render: (r) => <span style={{ fontFamily: mono }}>{money(r.amount)}</span> },
            { key: "category", label: "Category", grid: "1.3fr", render: (r) => <span style={pill(CATEGORY_META[r.category].bg, CATEGORY_META[r.category].color)}>{CATEGORY_META[r.category].label}</span> },
            {
              key: "receipt", label: "Receipt", grid: "0.8fr",
              render: (r) =>
                r.receiptFile ? (
                  <a href={r.receiptFile} download={r.receiptFileName || "receipt"} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: colors.accent, fontWeight: 600 }}>
                    {r.receiptFile.startsWith("data:image/") ? "🖼 View" : "📄 View"}
                  </a>
                ) : (
                  <span style={{ color: colors.textTertiary, fontSize: 12.5 }}>—</span>
                ),
            },
          ]}
        />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: mono, marginTop: 6 }}>{money(value)}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
