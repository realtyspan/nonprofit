import React, { useEffect, useMemo, useRef, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone, stripPhone } from "../lib/phone";

// Polls every 4s so multiple people checking tickets in at the door (each on
// their own device) see each other's check-ins, and each other's sales,
// without a manual refresh.
const POLL_MS = 4000;

function matchesSearch(t, search) {
  const q = search.trim().toLowerCase();
  if (!q) return false;
  if (String(t.number).includes(q)) return true;
  if (t.buyer && t.buyer.toLowerCase().includes(q)) return true;
  const qDigits = stripPhone(q);
  if (qDigits.length >= 3 && stripPhone(t.phone).includes(qDigits)) return true;
  return false;
}

export default function RaffleCheckIn({ gameId }) {
  const [checkIns, setCheckIns] = useState([]);
  const [searchable, setSearchable] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [hasGuest, setHasGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollRef = useRef(null);

  function refresh() {
    if (!gameId) { setCheckIns([]); setSearchable([]); return; }
    api.listRaffleCheckIns(gameId).then(setCheckIns).catch(() => {});
    api.searchRaffleCheckIn(gameId).then(setSearchable).catch(() => {});
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    return searchable.filter((t) => matchesSearch(t, search)).slice(0, 8);
  }, [searchable, search]);

  const target = selectedTicket || (matches.length === 1 ? matches[0] : null);
  const targetCheckIn = target ? checkIns.find((c) => c.ticketNumber === target.number) : null;

  function setSearchText(value) {
    setSearch(value);
    setSelectedTicket(null);
    setError("");
    setNotice("");
  }

  function clearSelection() {
    setSearch("");
    setSelectedTicket(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api.toggleRaffleCheckIn(gameId, target.number, hasGuest);
      setNotice(res.checkedIn ? `Ticket #${target.number} checked in.` : `Ticket #${target.number} check-in removed.`);
      clearSelection();
      setHasGuest(false);
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
      <form onSubmit={submit} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        {!target ? (
          <div style={{ position: "relative" }}>
            <Field label="Search ticket #, name, or phone">
              <input style={inputStyle} autoFocus value={search} onChange={(e) => setSearchText(e.target.value)} placeholder="e.g. 42, Jane Doe, or 555-123-4567" />
            </Field>
            {matches.length > 0 && (
              <div style={{ marginTop: 8, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
                {matches.map((t) => {
                  const already = checkIns.some((c) => c.ticketNumber === t.number);
                  return (
                    <button
                      type="button"
                      key={t.number}
                      onClick={() => setSelectedTicket(t)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                        padding: "10px 12px", border: "none", borderTop: `1px solid ${colors.borderLight}`,
                        background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>#{t.number}</strong> — {t.buyer || "—"}
                        {t.phone && <span style={{ color: colors.textSecondary }}> · {formatPhone(t.phone)}</span>}
                      </div>
                      {already && <span style={pill(colors.successBg, colors.success)}>Checked in</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {search.trim() && matches.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: colors.textSecondary }}>No sold, reserved, or funds-received ticket matches "{search.trim()}".</div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14 }}>
                <strong>Ticket #{target.number}</strong> — {target.buyer || "—"}
                {target.phone && <span style={{ color: colors.textSecondary }}> · {formatPhone(target.phone)}</span>}
              </div>
              <button type="button" style={button.ghost} onClick={clearSelection}>← Search again</button>
            </div>
            {targetCheckIn && (
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                Already checked in by {targetCheckIn.checkedInByName} at {new Date(targetCheckIn.checkedInAt).toLocaleTimeString()}
                {targetCheckIn.hasGuest ? " (+1 guest)" : ""}.
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={hasGuest} onChange={(e) => setHasGuest(e.target.checked)} />
              Bringing a guest
            </label>
            <div>
              <button type="submit" style={button.primary} disabled={busy}>
                {busy ? "Working…" : targetCheckIn ? "Undo check-in" : "Check in"}
              </button>
            </div>
          </div>
        )}
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        {notice && <div style={{ color: colors.success, fontSize: 12.5 }}>{notice}</div>}
      </form>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}`, display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Checked in ({checkIns.length})</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary }}>Updates automatically</div>
        </div>
        {checkIns.map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "0.6fr 1fr 1fr 1fr", padding: "10px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>#{c.ticketNumber}</div>
            <div>{c.hasGuest ? "+1 guest" : "—"}</div>
            <div style={{ color: colors.textSecondary }}>{c.checkedInByName}</div>
            <div style={{ fontSize: 11.5, color: colors.textTertiary }}>{new Date(c.checkedInAt).toLocaleTimeString()}</div>
          </div>
        ))}
        {checkIns.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No one checked in yet.</div>}
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
