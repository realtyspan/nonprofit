import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";

// Parses "1-20, 25, 30-40" into a flat array of ticket numbers.
function parseTicketRange(text) {
  const numbers = new Set();
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const [, a, b] = rangeMatch;
      const lo = Math.min(Number(a), Number(b));
      const hi = Math.max(Number(a), Number(b));
      for (let n = lo; n <= hi; n++) numbers.add(n);
    } else if (/^\d+$/.test(part)) {
      numbers.add(Number(part));
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

export default function RaffleAssign({ gameId }) {
  const [users, setUsers] = useState([]);
  const [sellerId, setSellerId] = useState("");
  const [rangeText, setRangeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api.listUsers().then((all) => {
      const sellers = all.filter((u) => u.moduleGrants?.raffle);
      setUsers(sellers);
      if (sellers[0]) setSellerId(sellers[0].id);
    }).catch(() => {});
  }, []);

  const ticketNumbers = parseTicketRange(rangeText);

  async function assign() {
    if (!sellerId || ticketNumbers.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.assignRaffleTickets(gameId, ticketNumbers, sellerId);
      setNotice(`Assigned ${ticketNumbers.length} ticket(s).`);
      setRangeText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function unassign() {
    if (ticketNumbers.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.unassignRaffleTickets(gameId, ticketNumbers);
      setNotice(`Unassigned ${ticketNumbers.length} ticket(s).`);
      setRangeText("");
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
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Assign ticket ranges</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Give a seller credit for a block of tickets before they've been sold, or move a range to someone else.</div>
      </div>

      <Field label="Seller">
        <select style={inputStyle} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>

      <Field label="Ticket numbers (e.g. 1-20, 25, 30-40)">
        <input style={inputStyle} value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="1-20, 25" />
      </Field>

      {ticketNumbers.length > 0 && (
        <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{ticketNumbers.length} ticket(s): {ticketNumbers.slice(0, 30).join(", ")}{ticketNumbers.length > 30 ? "…" : ""}</div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      {notice && <div style={{ color: colors.success, fontSize: 12.5 }}>{notice}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={button.primary} disabled={busy || !sellerId || ticketNumbers.length === 0} onClick={assign}>Assign to seller</button>
        <button style={button.ghost} disabled={busy || ticketNumbers.length === 0} onClick={unassign}>Unassign</button>
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
