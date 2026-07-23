import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";

const CATEGORY_META = {
  ticket_purchase: { label: "Ticket purchase (A5)", bg: colors.successBg, color: colors.success },
  license_fee: { label: "License fee", bg: colors.warningBg, color: colors.warning },
  indirect: { label: "Indirect disbursement", bg: colors.indigoBg, color: colors.indigo },
};

export default function Ledger() {
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", payee: "", checkNum: "", amount: "", category: "ticket_purchase" });
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
      setForm({ date: "", payee: "", checkNum: "", amount: "", category: "ticket_purchase" });
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        <SummaryCard label="Ticket purchase costs" value={sums.ticket_purchase} />
        <SummaryCard label="License fees paid" value={sums.license_fee} />
        <SummaryCard label="Indirect disbursements" value={sums.indirect} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={button.ghost} onClick={() => setShowForm((s) => !s)}>{showForm ? "− Cancel" : "+ Add transaction"}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr 1fr 1.2fr auto", gap: 10, alignItems: "end" }}>
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
          {error && <div style={{ gridColumn: "1 / -1", color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        </form>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr 1fr 1.3fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary, borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>Date</div>
          <div>Payee</div>
          <div>Check #</div>
          <div>Amount</div>
          <div>Category</div>
        </div>
        {rows.map((r) => {
          const meta = CATEGORY_META[r.category];
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr 1fr 1.3fr", padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5, alignItems: "center" }}>
              <div style={{ fontFamily: mono }}>{new Date(r.date).toLocaleDateString(undefined, { timeZone: "UTC" })}</div>
              <div>{r.payee}</div>
              <div style={{ fontFamily: mono }}>{r.checkNum}</div>
              <div style={{ fontFamily: mono }}>{money(r.amount)}</div>
              <div><span style={pill(meta.bg, meta.color)}>{meta.label}</span></div>
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No transactions yet.</div>}
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
