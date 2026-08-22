import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";
import ReceiptField from "../components/ReceiptField";
import DataList from "../components/DataList";

const CATEGORY_META = {
  ticket_purchase: { label: "Ticket purchase (A5)", bg: colors.successBg, color: colors.success },
  license_fee: { label: "License fee", bg: colors.warningBg, color: colors.warning },
  indirect: { label: "Indirect disbursement", bg: colors.indigoBg, color: colors.indigo },
};

export default function Ledger() {
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", payee: "", checkNum: "", amount: "", category: "ticket_purchase", receiptFile: "", receiptFileName: "" });
  const [error, setError] = useState("");

  function refresh() {
    api.listDisbursements().then(setRows).catch(() => {});
  }
  useEffect(refresh, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
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
        <DataList
          rows={rows}
          emptyMessage="No transactions yet."
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
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
