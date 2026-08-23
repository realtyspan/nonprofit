import React, { useEffect, useMemo, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { hasModuleTier } from "../lib/modules";
import { formatUtcDate } from "../lib/dates";
import { formatPhone, stripPhone } from "../lib/phone";
import Modal from "../components/Modal";

const STATUS_STYLE = {
  available: { bg: "#ffffff", border: colors.border, text: colors.textSecondary, label: "Available" },
  reserved: { bg: colors.warningBg, border: "#f0e4a6", text: colors.warning, label: "Reserved" },
  sold: { bg: colors.indigoBg, border: "#d8d4fb", text: colors.indigo, label: "Sold" },
  funds_received: { bg: colors.successBg, border: "#bfe6d1", text: colors.success, label: "Funds received" },
};

export default function RaffleGrid({ gameId, permissions, currentUserId }) {
  const [game, setGame] = useState(undefined); // undefined = loading, null = no raffle selected
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const canHelp = hasModuleTier(permissions, "raffle", "Helper") || permissions?.orgTier === "Owner" || permissions?.orgTier === "Viewer";
  const isAdmin = hasModuleTier(permissions, "raffle", "Admin") || permissions?.orgTier === "Owner";

  function refresh() {
    if (!gameId) {
      setGame(null); setTickets([]); setStats(null);
      return;
    }
    api.getRaffleGame(gameId).then(setGame).catch(() => setGame(null));
    api.listRaffleTickets(gameId).then(setTickets).catch(() => {});
    api.getRaffleStats(gameId).then(setStats).catch(() => {});
  }

  useEffect(refresh, [gameId]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (mineOnly && t.assignedSellerId !== currentUserId) return false;
      if (search && !String(t.number).includes(search.trim())) return false;
      return true;
    });
  }, [tickets, statusFilter, mineOnly, search, currentUserId]);

  if (game === undefined) return null;

  if (game === null) {
    return (
      <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>
        No raffle selected.{isAdmin ? " Go to Manage Raffles to start one." : " Check back once an Admin sets one up."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {stats && <RaffleStatsBars game={game} tickets={tickets} stats={stats} />}

      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 140 }}>
          <input
            style={{ ...inputStyle, width: "100%", paddingRight: search ? 26 : undefined }}
            placeholder="Ticket #"
            value={search}
            onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear ticket search"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", padding: 4,
                color: colors.textSecondary, fontSize: 15, lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>
        <select style={{ ...inputStyle, width: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
          <option value="funds_received">Funds received</option>
        </select>
        {canHelp && !isAdmin && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            My tickets only
          </label>
        )}
        <div style={{ marginLeft: "auto", fontSize: 12, color: colors.textSecondary }}>
          {game.totalTickets} tickets · ${game.ticketPrice} each{game.status === "closed" ? " · closed" : ""}
        </div>
      </div>

      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))", gap: 6 }}>
        {filtered.map((t) => {
          const s = STATUS_STYLE[t.status];
          const mine = t.assignedSellerId === currentUserId;
          return (
            <button
              key={t.number}
              onClick={() => setSelected(t)}
              title={t.buyer ? `${t.buyer}` : ""}
              style={{
                position: "relative", height: 44, borderRadius: 8, cursor: "pointer",
                background: s.bg, border: `1.5px solid ${mine ? colors.accent : s.border}`, color: s.text,
                fontSize: 13, fontWeight: 700,
              }}
            >
              {t.number}
            </button>
          );
        })}
        {filtered.length === 0 && <div style={{ gridColumn: "1 / -1", padding: 20, fontSize: 13, color: colors.textSecondary }}>No tickets match.</div>}
      </div>

      {selected && (
        <RaffleTicketModal
          gameId={gameId}
          ticket={selected}
          permissions={permissions}
          onClose={() => setSelected(null)}
          onChanged={() => { refresh(); setSelected(null); }}
        />
      )}
    </div>
  );
}

// Each row is the stat itself — a colored label, a horizontal fill bar, and
// the value — instead of a separate numeric card grid plus a separate chart
// below it. One component instead of two saves the vertical space that
// stacking both would cost, which matters most on a narrow (mobile) screen.
// Bar fill is each row's value against the raffle's total possible revenue
// (ticket count × price), not against each other, matching the reference
// design where "Total tickets" is always full and the dollar rows fill in
// toward that same shared ceiling.
function RaffleStatsBars({ game, tickets, stats }) {
  const maxRevenue = game.totalTickets * game.ticketPrice;
  const soldPending = tickets.filter((t) => t.status === "sold").reduce((sum, t) => sum + (t.tenderAmount || 0), 0);
  const unsoldPotential = stats.available * game.ticketPrice;

  const rows = [
    { key: "total", label: "Total tickets", display: stats.total, fraction: 1, color: colors.accent },
    { key: "sold_pending", label: "Sold, pending funds", display: money(soldPending), fraction: maxRevenue ? soldPending / maxRevenue : 0, color: colors.indigo },
    { key: "funds_received", label: "Funds received", display: money(stats.revenue), fraction: maxRevenue ? stats.revenue / maxRevenue : 0, color: colors.success },
    { key: "unsold", label: "Unsold potential", display: money(unsoldPotential), fraction: maxRevenue ? unsoldPotential / maxRevenue : 0, color: colors.textTertiary },
  ];

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 150, flex: "none", fontSize: 12.5, fontWeight: 600, color: r.color }}>{r.label}</div>
          <div style={{ flex: 1, height: 20, borderRadius: 6, background: "#f4f4f6", border: `1px solid ${colors.border}`, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Math.round(r.fraction * 100))}%`, height: "100%", background: r.color, borderRadius: 6 }} />
          </div>
          <div style={{ width: 90, flex: "none", textAlign: "right", fontSize: 13, fontWeight: 700, color: r.color }}>{r.display}</div>
        </div>
      ))}
    </div>
  );
}

function RaffleTicketModal({ gameId, ticket, permissions, onClose, onChanged }) {
  const canHelp = hasModuleTier(permissions, "raffle", "Helper") || permissions?.orgTier === "Owner";
  const isAdmin = hasModuleTier(permissions, "raffle", "Admin") || permissions?.orgTier === "Owner";
  const s = STATUS_STYLE[ticket.status];

  const [buyer, setBuyer] = useState(ticket.buyer || "");
  const [phone, setPhone] = useState(stripPhone(ticket.phone));
  const [email, setEmail] = useState(ticket.email || "");
  const [address, setAddress] = useState(ticket.address || "");
  const [recordAs, setRecordAs] = useState("sold"); // reserved | sold | funds_received
  const [tenderType, setTenderType] = useState("cash");
  const [tenderAmount, setTenderAmount] = useState(100);
  const [checkNumber, setCheckNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previousBuyers, setPreviousBuyers] = useState([]);

  useEffect(() => {
    if (!canHelp) return;
    api.getRaffleTicketHistory(gameId, ticket.number).then(setPreviousBuyers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useBuyer(prev) {
    setBuyer(prev.buyer);
    setPhone(stripPhone(prev.phone));
    setEmail(prev.email || "");
    setAddress(prev.address || "");
  }

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function record() {
    if (!buyer) return setError("Buyer name is required");
    const needsTender = recordAs === "sold" || recordAs === "funds_received";
    if (needsTender && tenderType === "check" && !checkNumber) return setError("Check number is required for check tender");
    run(() =>
      api.recordRaffleTicket(gameId, ticket.number, {
        buyer, phone, email, address, status: recordAs,
        tenderType: needsTender ? tenderType : undefined,
        tenderAmount: needsTender ? Number(tenderAmount) : undefined,
        checkNumber: needsTender && tenderType === "check" ? checkNumber : undefined,
      })
    );
  }

  function markSold() {
    if (tenderType === "check" && !checkNumber) return setError("Check number is required for check tender");
    run(() => api.markRaffleTicketSold(gameId, ticket.number, { tenderType, tenderAmount: Number(tenderAmount), checkNumber: tenderType === "check" ? checkNumber : undefined }));
  }

  function markFundsReceived() {
    if (tenderType === "check" && !checkNumber) return setError("Check number is required for check tender");
    run(() => api.markRaffleTicketFundsReceived(gameId, ticket.number, { tenderType, tenderAmount: Number(tenderAmount), checkNumber: tenderType === "check" ? checkNumber : undefined }));
  }

  function release() {
    run(() => api.releaseRaffleTicket(gameId, ticket.number));
  }

  async function resendConfirmation() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.sendRaffleConfirmation(gameId, ticket.number);
      setNotice("Confirmation email sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendETicket() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.sendRaffleETicket(gameId, ticket.number);
      setNotice("Electronic ticket sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onClose} width={440}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Ticket #{ticket.number}</div>
          <span style={pill(s.bg, s.text)}>{s.label}</span>
        </div>
        {ticket.assignedSellerName && (
          <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>Assigned to {ticket.assignedSellerName}</div>
        )}

        {ticket.status === "available" && canHelp && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {previousBuyers.length > 0 && (
              <div style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b", textTransform: "uppercase" }}>Previously purchased by</div>
                {previousBuyers.map((prev, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{prev.buyer}</div>
                      <div style={{ color: colors.textSecondary, fontSize: 11 }}>{prev.gameName} · {formatUtcDate(prev.raffleStartDate)}</div>
                    </div>
                    <button type="button" style={button.ghost} onClick={() => useBuyer(prev)}>Use this buyer</button>
                  </div>
                ))}
              </div>
            )}
            <Field label="Buyer name"><input style={inputStyle} value={buyer} onChange={(e) => setBuyer(e.target.value)} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <Field label="Phone"><input style={inputStyle} value={formatPhone(phone)} onChange={(e) => setPhone(stripPhone(e.target.value))} /></Field>
              <Field label="Email"><input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            </div>
            <Field label="Address"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
            <Field label="Record as">
              <select style={inputStyle} value={recordAs} onChange={(e) => setRecordAs(e.target.value)}>
                <option value="reserved">Reserved (not paid yet)</option>
                <option value="sold">Sold (payment collected)</option>
                {isAdmin && <option value="funds_received">Funds received (turned in already)</option>}
              </select>
            </Field>
            {(recordAs === "sold" || recordAs === "funds_received") && (
              <TenderFields tenderType={tenderType} setTenderType={setTenderType} tenderAmount={tenderAmount} setTenderAmount={setTenderAmount} checkNumber={checkNumber} setCheckNumber={setCheckNumber} />
            )}
            {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={button.ghost} onClick={onClose}>Cancel</button>
              <button style={button.primary} disabled={busy} onClick={record}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        )}

        {ticket.status !== "available" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              <div><strong>Buyer:</strong> {ticket.buyer || "—"}</div>
              {ticket.phone && <div><strong>Phone:</strong> {formatPhone(ticket.phone)}</div>}
              {ticket.email && <div><strong>Email:</strong> {ticket.email}</div>}
              {ticket.tenderAmount != null && <div><strong>Paid:</strong> {money(ticket.tenderAmount)} ({ticket.tenderType}{ticket.checkNumber ? ` #${ticket.checkNumber}` : ""})</div>}
            </div>

            {previousBuyers.length > 0 && (
              <div style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b", textTransform: "uppercase" }}>Past buyers</div>
                {previousBuyers.map((prev, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: colors.textSecondary, fontSize: 11, minWidth: 34 }}>{new Date(prev.raffleStartDate).getUTCFullYear()}</span>
                    <span style={{ fontWeight: 600 }}>{prev.buyer}</span>
                    {prev.phone && <span style={{ color: colors.textSecondary }}>{formatPhone(prev.phone)}</span>}
                  </div>
                ))}
              </div>
            )}

            {ticket.status === "reserved" && canHelp && (
              <TenderFields tenderType={tenderType} setTenderType={setTenderType} tenderAmount={tenderAmount} setTenderAmount={setTenderAmount} checkNumber={checkNumber} setCheckNumber={setCheckNumber} />
            )}

            {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
            {notice && <div style={{ color: colors.success, fontSize: 12.5 }}>{notice}</div>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ticket.status === "reserved" && canHelp && (
                <button style={button.primary} disabled={busy} onClick={markSold}>Mark sold</button>
              )}
              {(ticket.status === "sold" || ticket.status === "reserved") && isAdmin && (
                <button style={button.primary} disabled={busy} onClick={markFundsReceived}>Mark funds received</button>
              )}
              {canHelp && (ticket.status !== "funds_received" || isAdmin) && (
                <button style={button.ghost} disabled={busy} onClick={release}>Release</button>
              )}
              {canHelp && ticket.email && ["sold", "funds_received"].includes(ticket.status) && (
                <button style={button.ghost} disabled={busy} onClick={resendConfirmation}>Resend confirmation</button>
              )}
              {isAdmin && ticket.email && ticket.status === "funds_received" && (
                <button style={button.ghost} disabled={busy} onClick={sendETicket}>Send e-ticket</button>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={button.ghost} onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {ticket.status === "available" && !canHelp && (
          <div style={{ fontSize: 13, color: colors.textSecondary }}>This ticket is available. You have read-only access to the raffle module.</div>
        )}
    </Modal>
  );
}

function TenderFields({ tenderType, setTenderType, tenderAmount, setTenderAmount, checkNumber, setCheckNumber }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
      <Field label="Tender">
        <select style={inputStyle} value={tenderType} onChange={(e) => setTenderType(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
        </select>
      </Field>
      <Field label="Amount"><input style={inputStyle} type="number" step="0.01" value={tenderAmount} onChange={(e) => setTenderAmount(e.target.value)} /></Field>
      {tenderType === "check" && (
        <Field label="Check #"><input style={inputStyle} value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} /></Field>
      )}
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
