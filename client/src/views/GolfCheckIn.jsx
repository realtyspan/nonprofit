import React, { useEffect, useMemo, useRef, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone, stripPhone } from "../lib/phone";
import DataList from "../components/DataList";

// Polls every 4s so multiple people checking players in at the door (each on
// their own device) see each other's check-ins without a manual refresh —
// same convention as RaffleCheckIn.jsx.
const POLL_MS = 4000;

function matchesSearch(p, search) {
  const q = search.trim().toLowerCase();
  if (!q) return false;
  if (p.name && p.name.toLowerCase().includes(q)) return true;
  if (p.teamName && p.teamName.toLowerCase().includes(q)) return true;
  const qDigits = stripPhone(q);
  if (qDigits.length >= 3 && stripPhone(p.phone).includes(qDigits)) return true;
  return false;
}

export default function GolfCheckIn({ tournament }) {
  const [checkIns, setCheckIns] = useState([]);
  const [searchable, setSearchable] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollRef = useRef(null);

  function refresh() {
    if (!tournament) { setCheckIns([]); setSearchable([]); return; }
    api.listGolfCheckIns(tournament.id).then(setCheckIns).catch(() => {});
    api.searchGolfCheckIn(tournament.id).then(setSearchable).catch(() => {});
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    return searchable.filter((p) => matchesSearch(p, search)).slice(0, 8);
  }, [searchable, search]);

  const target = selected || (matches.length === 1 ? matches[0] : null);
  const targetCheckIn = target ? checkIns.find((c) => c.teamPlayerId === target.id) : null;

  function setSearchText(value) {
    setSearch(value);
    setSelected(null);
    setError("");
    setNotice("");
  }

  function clearSelection() {
    setSearch("");
    setSelected(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api.toggleGolfCheckIn(tournament.id, target.id);
      setNotice(res.checkedIn ? `${target.name} checked in.` : `${target.name}'s check-in removed.`);
      clearSelection();
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!tournament) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No tournament selected.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={submit} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        {!target ? (
          <div style={{ position: "relative" }}>
            <Field label="Search by name, team, or phone">
              <input style={inputStyle} autoFocus value={search} onChange={(e) => setSearchText(e.target.value)} placeholder="e.g. Jane Doe, Team Alpha, or 555-123-4567" />
            </Field>
            {matches.length > 0 && (
              <div style={{ marginTop: 8, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
                {matches.map((p) => {
                  const already = checkIns.some((c) => c.teamPlayerId === p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setSelected(p)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                        padding: "10px 12px", border: "none", borderTop: `1px solid ${colors.borderLight}`,
                        background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>{p.name}</strong>{p.isCaptain && <span style={{ color: colors.textSecondary }}> · captain</span>}
                        {p.teamName && <span style={{ color: colors.textSecondary }}> · {p.teamName}</span>}
                        {p.phone && <span style={{ color: colors.textSecondary }}> · {formatPhone(p.phone)}</span>}
                      </div>
                      {already && <span style={pill(colors.successBg, colors.success)}>Checked in</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {search.trim() && matches.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: colors.textSecondary }}>No player matches "{search.trim()}".</div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14 }}>
                <strong>{target.name}</strong>{target.teamName && <span style={{ color: colors.textSecondary }}> · {target.teamName}</span>}
                {target.phone && <span style={{ color: colors.textSecondary }}> · {formatPhone(target.phone)}</span>}
              </div>
              <button type="button" style={button.ghost} onClick={clearSelection}>← Search again</button>
            </div>
            {targetCheckIn && (
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                Already checked in by {targetCheckIn.checkedInByName} at {new Date(targetCheckIn.checkedInAt).toLocaleTimeString()}.
              </div>
            )}
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
        <DataList
          rows={checkIns.map((c) => ({ ...c, playerName: searchable.find((p) => p.id === c.teamPlayerId)?.name || "—" }))}
          emptyMessage="No one checked in yet."
          columns={[
            { key: "player", label: "Player", grid: "1fr", primary: true, render: (c) => <strong>{c.playerName}</strong> },
            { key: "who", label: "Checked in by", grid: "1fr", render: (c) => <span style={{ color: colors.textSecondary }}>{c.checkedInByName}</span> },
            { key: "time", label: "Time", grid: "1fr", render: (c) => <span style={{ fontSize: 11.5, color: colors.textTertiary }}>{new Date(c.checkedInAt).toLocaleTimeString()}</span> },
          ]}
        />
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
