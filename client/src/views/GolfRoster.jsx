import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";

const PAYMENT_STYLE = {
  unpaid: [colors.warningBg, colors.warning, "Unpaid"],
  pending: [colors.indigoBg, colors.indigo, "Pending"],
  paid: [colors.successBg, colors.success, "Paid"],
};

// Roster/team management for the selected tournament — add teams and
// players manually (phone-in registrations, or seeding data before the
// public signup page exists), record check/in-person payments, and comp a
// team's entry against a confirmed sponsorship.
export default function GolfRoster({ tournament }) {
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState(null);
  const [sponsorships, setSponsorships] = useState([]);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [loadError, setLoadError] = useState("");

  function refresh() {
    if (!tournament) return;
    api.listGolfTeams(tournament.id).then(setTeams).catch((err) => setLoadError(err.message));
    api.getGolfStats(tournament.id).then(setStats).catch(() => {});
    api.listGolfSponsorships(tournament.id).then(setSponsorships).catch(() => {});
  }
  useEffect(refresh, [tournament?.id]);

  if (!tournament) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No tournament selected.</div>;
  }

  const confirmedSponsorships = sponsorships.filter((s) => s.status === "confirmed");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {stats && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={pill("#f1ece0", colors.textSecondary)}>
            {stats.registeredTeams}{stats.capacity ? `/${stats.capacity}` : ""} teams
          </span>
          <span style={pill(...PAYMENT_STYLE.unpaid.slice(0, 2))}>{stats.unpaid} unpaid</span>
          <span style={pill(...PAYMENT_STYLE.pending.slice(0, 2))}>{stats.pending} pending</span>
          <span style={pill(...PAYMENT_STYLE.paid.slice(0, 2))}>{stats.paid} paid</span>
          <span style={pill(colors.successBg, colors.success)}>{money(stats.revenue)} collected</span>
        </div>
      )}

      {loadError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{loadError}</div>}

      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: colors.textSecondary }}>Register a team on someone's behalf — over the phone, at a meeting, or to seed data before the public signup page exists.</div>
        <button style={button.primary} onClick={() => setShowAddTeam(true)}>+ Add team</button>
      </div>

      {teams.length === 0 && !loadError && (
        <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No teams registered yet.</div>
      )}

      {teams.map((team) => (
        <TeamCard key={team.id} team={team} tournament={tournament} confirmedSponsorships={confirmedSponsorships} onChanged={refresh} />
      ))}

      {showAddTeam && (
        <AddTeamModal tournament={tournament} onCancel={() => setShowAddTeam(false)} onCreated={() => { setShowAddTeam(false); refresh(); }} />
      )}
    </div>
  );
}

function TeamCard({ team, tournament, confirmedSponsorships, onChanged }) {
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showComp, setShowComp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function markPaid(teamPlayerId, paymentMethod) {
    setBusy(true);
    setError("");
    try {
      await api.markGolfTeamPaid(tournament.id, team.id, { teamPlayerIds: [teamPlayerId], paymentMethod });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(teamPlayerId) {
    setBusy(true);
    setError("");
    try {
      await api.removeGolfTeamPlayer(tournament.id, team.id, teamPlayerId);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTeam() {
    if (!window.confirm(`Remove team${team.name ? ` "${team.name}"` : ""}? This can't be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteGolfTeam(tournament.id, team.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{team.name || `Team (${team.players.length} player${team.players.length === 1 ? "" : "s"})`}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {team.sponsorship && (
            <span style={pill(colors.indigoBg, colors.indigo)}>Comped by {team.sponsorship.sponsor.companyName}</span>
          )}
          <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={removeTeam} disabled={busy}>Remove team</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {team.players.map((tp) => {
          const [bg, text, label] = PAYMENT_STYLE[tp.paymentStatus] || PAYMENT_STYLE.unpaid;
          return (
            <div key={tp.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${colors.borderLight}` }}>
              <div style={{ flex: "1 1 160px" }}>
                <strong>{tp.player.name}</strong>{tp.isCaptain && <span style={{ color: colors.textSecondary, fontSize: 11.5 }}> · captain</span>}
                {tp.player.email && <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{tp.player.email}</div>}
              </div>
              <span style={pill(bg, text)}>{label}{tp.paymentMethod ? ` · ${tp.paymentMethod.replace("_", " ")}` : ""}</span>
              {tp.checkIn && <span style={pill(colors.successBg, colors.success)}>Checked in</span>}
              {tp.paymentStatus !== "paid" && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...button.ghost, padding: "4px 8px", fontSize: 11.5 }} disabled={busy} onClick={() => markPaid(tp.id, "check")}>Mark paid (check)</button>
                  <button style={{ ...button.ghost, padding: "4px 8px", fontSize: 11.5 }} disabled={busy} onClick={() => markPaid(tp.id, "in_person")}>Mark paid (in person)</button>
                </div>
              )}
              <button style={{ ...button.ghost, padding: "4px 8px", fontSize: 11.5, color: colors.danger }} disabled={busy} onClick={() => removePlayer(tp.id)}>Remove</button>
            </div>
          );
        })}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {team.players.length < tournament.maxTeamSize && (
          <button style={button.ghost} onClick={() => setShowAddPlayer(true)}>+ Add player</button>
        )}
        {!team.sponsorship && confirmedSponsorships.length > 0 && (
          <button style={button.ghost} onClick={() => setShowComp(true)}>Comp with a sponsorship</button>
        )}
      </div>

      {showAddPlayer && (
        <AddPlayerForm
          tournament={tournament} team={team}
          onCancel={() => setShowAddPlayer(false)}
          onAdded={() => { setShowAddPlayer(false); onChanged(); }}
        />
      )}

      {showComp && (
        <CompTeamForm
          tournament={tournament} team={team} sponsorships={confirmedSponsorships}
          onCancel={() => setShowComp(false)}
          onComped={() => { setShowComp(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function AddPlayerForm({ tournament, team, onCancel, onAdded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isCaptain, setIsCaptain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("A name is required");
    setBusy(true);
    setError("");
    try {
      await api.addGolfTeamPlayer(tournament.id, team.id, { name: name.trim(), email: email.trim(), phone: phone.trim(), isCaptain });
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "#f7f4ec", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={{ ...inputStyle, flex: "1 1 140px" }} required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={{ ...inputStyle, flex: "1 1 160px" }} type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
        <input type="checkbox" checked={isCaptain} onChange={(e) => setIsCaptain(e.target.checked)} /> Captain
      </label>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={button.primary} disabled={busy}>{busy ? "Adding…" : "Add player"}</button>
        <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function CompTeamForm({ tournament, team, sponsorships, onCancel, onComped }) {
  const [sponsorshipId, setSponsorshipId] = useState(sponsorships[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!sponsorshipId) return setError("Choose a sponsorship");
    setBusy(true);
    setError("");
    try {
      await api.updateGolfTeam(tournament.id, team.id, { sponsorshipId });
      onComped();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "#f7f4ec", borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: colors.textSecondary }}>Every unpaid player on this team will be marked paid, covered by the sponsorship. Already-paid players are left alone.</div>
      <select style={inputStyle} value={sponsorshipId} onChange={(e) => setSponsorshipId(e.target.value)}>
        {sponsorships.map((s) => (
          <option key={s.id} value={s.id}>{s.sponsor.companyName}{s.tierName ? ` (${s.tierName})` : ""}</option>
        ))}
      </select>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={button.primary} disabled={busy}>{busy ? "Working…" : "Comp this team"}</button>
        <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function AddTeamModal({ tournament, onCancel, onCreated }) {
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([{ name: "", email: "", phone: "", isCaptain: true }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setPlayer(i, k, v) {
    setPlayers((ps) => ps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }
  function addPlayerRow() {
    if (players.length >= tournament.maxTeamSize) return;
    setPlayers((ps) => [...ps, { name: "", email: "", phone: "", isCaptain: false }]);
  }
  function removePlayerRow(i) {
    setPlayers((ps) => ps.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    if (players.some((p) => !p.name.trim())) return setError("Every player needs a name");
    setBusy(true);
    setError("");
    try {
      await api.createGolfTeam(tournament.id, { teamName: teamName.trim(), players });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>Add a team</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input style={inputStyle} placeholder="Team name (optional)" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
        {players.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 8, background: "#f7f4ec", borderRadius: 8 }}>
            <input style={{ ...inputStyle, flex: "1 1 140px" }} required placeholder="Name" value={p.name} onChange={(e) => setPlayer(i, "name", e.target.value)} />
            <input style={{ ...inputStyle, flex: "1 1 160px" }} type="email" placeholder="Email (optional)" value={p.email} onChange={(e) => setPlayer(i, "email", e.target.value)} />
            <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="Phone (optional)" value={p.phone} onChange={(e) => setPlayer(i, "phone", e.target.value)} />
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <input type="checkbox" checked={p.isCaptain} onChange={(e) => setPlayer(i, "isCaptain", e.target.checked)} /> Captain
            </label>
            {players.length > 1 && <button type="button" style={{ ...button.ghost, padding: "4px 8px", fontSize: 11.5, color: colors.danger }} onClick={() => removePlayerRow(i)}>Remove</button>}
          </div>
        ))}
        {players.length < tournament.maxTeamSize && (
          <div><button type="button" style={button.ghost} onClick={addPlayerRow}>+ Add another player</button></div>
        )}
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Registering…" : "Register team"}</button>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
