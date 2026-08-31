import React, { useEffect, useMemo, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone, stripPhone } from "../lib/phone";
import DataList from "../components/DataList";
import Modal from "../components/Modal";

// The standing, tournament-independent player list — every player ever
// recorded, whether added to a live tournament or brought in via a
// historical CSV import (both paths land in the same GolfPlayer table, see
// golf.js's /players route). This is the "who do we reach out to" screen;
// GolfRoster.jsx stays scoped to one tournament's own roster.
export default function GolfPlayerDirectory() {
  const [players, setPlayers] = useState(null);
  const [search, setSearch] = useState("");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    api.listGolfPlayers().then(setPlayers).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  const filtered = useMemo(() => {
    if (!players) return [];
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.phone.includes(q));
  }, [players, search]);

  if (players === null) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <span style={pill("#f1ece0", colors.textSecondary)}>{players.length} player{players.length === 1 ? "" : "s"} on file</span>
        <input
          style={{ ...inputStyle, maxWidth: 260 }}
          placeholder="Search name, email, or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <DataList
          rows={filtered}
          emptyMessage={search ? "No players match that search." : "No players yet — they'll show up here once someone registers or a historical import is run."}
          columns={[
            { key: "name", label: "Name", grid: "1.2fr", primary: true, render: (p) => p.name },
            { key: "email", label: "Email", grid: "1.4fr", render: (p) => p.email || "—" },
            { key: "phone", label: "Phone", grid: "1fr", render: (p) => (p.phone ? formatPhone(p.phone) : "—") },
            { key: "history", label: "Played", grid: "1fr", render: (p) => (p.tournamentCount > 0 ? `${p.tournamentCount}x, last ${p.lastYear}` : "Never") },
            {
              key: "actions", label: "", footerRow: true,
              render: (p) => <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingPlayer(p)}>Edit contact info</button>,
            },
          ]}
        />
      </div>

      {editingPlayer && (
        <EditPlayerModal
          player={editingPlayer}
          onCancel={() => setEditingPlayer(null)}
          onSaved={() => { setEditingPlayer(null); refresh(); }}
        />
      )}
    </div>
  );
}

function EditPlayerModal({ player, onCancel, onSaved }) {
  const [name, setName] = useState(player.name);
  const [email, setEmail] = useState(player.email);
  const [phone, setPhone] = useState(player.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("A name is required");
    setBusy(true);
    setError("");
    try {
      await api.updateGolfPlayer(player.id, { name: name.trim(), email: email.trim(), phone: phone.trim() });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={420} title="Edit contact info">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input style={inputStyle} required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={inputStyle} placeholder="Phone" value={formatPhone(phone)} onChange={(e) => setPhone(stripPhone(e.target.value))} />
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
