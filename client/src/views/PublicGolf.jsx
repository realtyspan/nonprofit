import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import logo from "../assets/logo.png";

function emptyPlayer(isCaptain) {
  return { name: "", email: "", phone: "", isCaptain };
}

export default function PublicGolf({ slug }) {
  const [page, setPage] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [openTournamentId, setOpenTournamentId] = useState(null);

  useEffect(() => {
    publicApi.getGolfPage(slug).then(setPage).catch((err) => setLoadError(err.message));
  }, [slug]);

  if (loadError) return <Centered>This page isn't available.</Centered>;
  if (!page) return <Centered>Loading…</Centered>;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.textPrimary }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
        <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>{page.orgName} — Golf Tournament</div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 60px", display: "flex", flexDirection: "column", gap: 20 }}>
        {page.tournaments.length === 0 && (
          <div style={{ ...card, fontSize: 13.5, color: colors.textSecondary }}>No tournaments are open for registration right now.</div>
        )}

        {page.tournaments.map((t) => (
          <TournamentCard
            key={t.id}
            tournament={t}
            slug={slug}
            expanded={openTournamentId === t.id}
            onToggle={() => setOpenTournamentId(openTournamentId === t.id ? null : t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TournamentCard({ tournament, slug, expanded, onToggle }) {
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 19, fontWeight: 700 }}>{tournament.name}</div>
        {tournament.format && <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{tournament.format}</div>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 13.5 }}>
        <div><strong>{new Date(tournament.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</strong></div>
        <div>{money(tournament.costPerPlayer)} per player</div>
        {tournament.venueName && <div>{tournament.venueName}</div>}
      </div>

      {tournament.includedDescription && (
        <div style={{ fontSize: 13, color: colors.textSecondary, whiteSpace: "pre-wrap" }}>{tournament.includedDescription}</div>
      )}
      {tournament.scheduleText && (
        <div style={{ fontSize: 13, color: colors.textSecondary, whiteSpace: "pre-wrap" }}><strong>Schedule:</strong> {tournament.scheduleText}</div>
      )}
      {(tournament.contactName || tournament.contactPhone || tournament.contactEmail) && (
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
          Questions? {tournament.contactName}{tournament.contactPhone ? ` · ${tournament.contactPhone}` : ""}{tournament.contactEmail ? ` · ${tournament.contactEmail}` : ""}
        </div>
      )}

      {tournament.isFull ? (
        <div style={{ fontSize: 13.5, color: colors.danger, fontWeight: 600 }}>This tournament is full.</div>
      ) : (
        <>
          {tournament.spotsRemaining != null && (
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>{tournament.spotsRemaining} team spot{tournament.spotsRemaining === 1 ? "" : "s"} remaining</div>
          )}
          {!expanded ? (
            <div><button style={button.primary} onClick={onToggle}>Register a team</button></div>
          ) : (
            <RegisterForm tournament={tournament} slug={slug} onCancel={onToggle} />
          )}
        </>
      )}
    </div>
  );
}

function RegisterForm({ tournament, slug, onCancel }) {
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([emptyPlayer(true)]);
  const [website, setWebsite] = useState(""); // honeypot — real visitors never see this field
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function setPlayer(i, k, v) {
    setPlayers((ps) => ps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }
  function addPlayerRow() {
    if (players.length >= tournament.maxTeamSize) return;
    setPlayers((ps) => [...ps, emptyPlayer(false)]);
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
      const res = await publicApi.registerGolfTeam(slug, tournament.id, { teamName, players, website });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const { payment } = result;
    return (
      <div style={{ padding: 14, background: colors.successBg, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: colors.success }}>You're registered!</div>
        <div style={{ fontSize: 13 }}>
          {result.team.players.map((p) => p.name).join(", ")} — {money(tournament.costPerPlayer)} per player.
        </div>
        {payment.allowCheckPayment && (
          <div style={{ fontSize: 12.5 }}><strong>To pay by check:</strong> {payment.checkPayableInstructions || "Contact the organizer for instructions."}</div>
        )}
        {payment.allowInPersonPayment && (
          <div style={{ fontSize: 12.5 }}><strong>To pay in person:</strong> {payment.inPersonPaymentInstructions || "Contact the organizer for instructions."}</div>
        )}
        {!payment.allowCheckPayment && !payment.allowInPersonPayment && (
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>The organizer will follow up with payment instructions.</div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "#fafafa", borderRadius: 8 }}>
      <input
        type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true"
      />
      <input style={inputStyle} placeholder="Team name (optional)" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
      {players.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inputStyle, flex: "1 1 140px" }} required placeholder={i === 0 ? "Your name" : "Player name"} value={p.name} onChange={(e) => setPlayer(i, "name", e.target.value)} />
          <input style={{ ...inputStyle, flex: "1 1 160px" }} type="email" placeholder="Email" value={p.email} onChange={(e) => setPlayer(i, "email", e.target.value)} />
          <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="Phone" value={p.phone} onChange={(e) => setPlayer(i, "phone", e.target.value)} />
          {players.length > 1 && <button type="button" style={{ ...button.ghost, padding: "4px 8px", fontSize: 11.5, color: colors.danger }} onClick={() => removePlayerRow(i)}>Remove</button>}
        </div>
      ))}
      {players.length < tournament.maxTeamSize && (
        <div><button type="button" style={button.ghost} onClick={addPlayerRow}>+ Add another player</button></div>
      )}
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" style={button.primary} disabled={busy}>{busy ? "Registering…" : "Register"}</button>
        <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
      <div style={{ fontSize: 13.5, color: colors.textSecondary }}>{children}</div>
    </div>
  );
}
