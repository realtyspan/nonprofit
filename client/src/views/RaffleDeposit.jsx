import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";

export default function RaffleDeposit({ gameId }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [tenderType, setTenderType] = useState("cash");
  const [tenderAmount, setTenderAmount] = useState(100);
  const [checkNumber, setCheckNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function refresh() {
    if (!gameId) return setTickets([]);
    api.listRaffleTickets(gameId).then((all) => setTickets(all.filter((t) => t.status === "sold" || t.status === "reserved"))).catch(() => {});
  }
  useEffect(refresh, [gameId]);

  function toggle(number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(tickets.map((t) => t.number)));
  }

  async function submit() {
    if (selected.size === 0) return;
    if (tenderType === "check" && !checkNumber) return setError("Check number is required for check tender");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.bulkMarkRaffleFundsReceived(gameId, {
        ticketNumbers: [...selected], tenderType, tenderAmount: Number(tenderAmount),
        checkNumber: tenderType === "check" ? checkNumber : undefined,
      });
      setNotice(`Marked ${selected.size} ticket(s) as funds received.`);
      setSelected(new Set());
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!gameId) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No raffle selected.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <Field label="Tender">
          <select style={inputStyle} value={tenderType} onChange={(e) => setTenderType(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
          </select>
        </Field>
        <Field label="Amount (applied to each selected ticket)">
          <input style={{ ...inputStyle, width: 140 }} type="number" step="0.01" value={tenderAmount} onChange={(e) => setTenderAmount(e.target.value)} />
        </Field>
        {tenderType === "check" && (
          <Field label="Check #"><input style={{ ...inputStyle, width: 140 }} value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} /></Field>
        )}
        <button style={button.primary} disabled={busy || selected.size === 0} onClick={submit}>
          Mark {selected.size || ""} funds received
        </button>
        <button style={button.ghost} onClick={selectAll}>Select all ({tickets.length})</button>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      {notice && <div style={{ color: colors.success, fontSize: 12.5 }}>{notice}</div>}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 0.6fr 1.4fr 1fr 1fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div></div><div>#</div><div>Buyer</div><div>Status</div><div>Amount</div>
        </div>
        {tickets.map((t) => (
          <div key={t.number} onClick={() => toggle(t.number)} style={{ display: "grid", gridTemplateColumns: "auto 0.6fr 1.4fr 1fr 1fr", padding: "10px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={selected.has(t.number)} onChange={() => toggle(t.number)} onClick={(e) => e.stopPropagation()} />
            <div style={{ fontWeight: 700 }}>#{t.number}</div>
            <div>{t.buyer}</div>
            <div style={{ textTransform: "capitalize", color: colors.textSecondary }}>{t.status}</div>
            <div>{t.tenderAmount != null ? money(t.tenderAmount) : "—"}</div>
          </div>
        ))}
        {tickets.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No sold or reserved tickets awaiting deposit.</div>}
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
