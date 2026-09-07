import React, { useEffect, useRef, useState } from "react";
import { colors, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import { formatPhone, stripPhone } from "../lib/phone";
import { EVT_CSS, evtStyleVars, TournamentVisual, FooterContact } from "../components/TournamentVisual";
import logo from "../assets/logo.png";

function emptyPlayer(isCaptain) {
  return { name: "", email: "", phone: "", isCaptain };
}

export default function PublicTournament({ orgSlug, tournamentSlug, embed }) {
  const [page, setPage] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font || "Inter");

  useEffect(() => {
    publicApi.getTournamentPage(orgSlug, tournamentSlug).then((data) => setPage({ ...data.tournament, orgName: data.orgName })).catch((err) => setLoadError(err.message));
  }, [orgSlug, tournamentSlug]);

  useEffect(() => {
    if (!embed || !containerRef.current) return;
    const el = containerRef.current;
    const post = () => postEmbedResize(el.scrollHeight);
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed, page, showForm]);

  if (loadError) return <Centered embed={embed}>This tournament isn't open for registration.</Centered>;
  if (!page) return <Centered embed={embed}>Loading…</Centered>;

  return (
    <div ref={containerRef} style={{ minHeight: embed ? "auto" : "100vh", background: embed ? (theme.bg || "transparent") : colors.bg }}>
      <style>{EVT_CSS}</style>

      {!embed && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "sans-serif" }}>{page.orgName} — Tournaments</div>
        </header>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>
        <TournamentCard tournament={page} orgSlug={orgSlug} theme={theme} font={font} expanded={showForm} onToggle={() => setShowForm((s) => !s)} />
      </div>
    </div>
  );
}

function TournamentCard({ tournament, orgSlug, theme, font, expanded, onToggle }) {
  return (
    <div className="evt" style={evtStyleVars(theme, font)}>
      <div className="evt-card">
        <TournamentVisual tournament={tournament} />

        <div className="evt-footer">
          <FooterContact tournament={tournament} />
          <div className="evt-footer-actions">
            {tournament.isFull ? (
              <p className="evt-full">This tournament is full.</p>
            ) : (
              <>
                {tournament.spotsRemaining != null && (
                  <p className="evt-spots"><span className="evt-dot" />{tournament.spotsRemaining} team spot{tournament.spotsRemaining === 1 ? "" : "s"} remaining</p>
                )}
                {!expanded && <button type="button" className="evt-btn" onClick={onToggle}>Register a team</button>}
              </>
            )}
          </div>
        </div>

        {expanded && !tournament.isFull && (
          <div className="evt-formwrap">
            <RegisterForm tournament={tournament} orgSlug={orgSlug} onCancel={onToggle} />
          </div>
        )}
      </div>
    </div>
  );
}

// Direct port of PublicGolf.jsx's RegisterForm, minus the "have you played
// before" lookup step (slice 2 — see the plan doc).
function RegisterForm({ tournament, orgSlug, onCancel }) {
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([emptyPlayer(true)]);
  const [website, setWebsite] = useState(""); // honeypot — real visitors never see this field
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function setPlayer(i, k, v) {
    setPlayers((ps) => ps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }
  function setCaptain(i) {
    setPlayers((ps) => ps.map((p, idx) => ({ ...p, isCaptain: idx === i })));
  }
  function addPlayerRow() {
    if (players.length >= tournament.maxTeamSize) return;
    setPlayers((ps) => [...ps, emptyPlayer(false)]);
  }
  function removePlayerRow(i) {
    setPlayers((ps) => {
      const removingCaptain = ps[i]?.isCaptain;
      const rest = ps.filter((_, idx) => idx !== i);
      if (removingCaptain && rest.length > 0 && !rest.some((p) => p.isCaptain)) {
        rest[0] = { ...rest[0], isCaptain: true };
      }
      return rest;
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (players.some((p) => !p.name.trim())) return setError("Every player needs a name");
    if (players.some((p) => !p.phone.trim())) return setError("Every player needs a phone number");
    setBusy(true);
    setError("");
    try {
      const res = await publicApi.registerTournamentTeam(orgSlug, tournament.slug, { teamName, players, website });
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
      <div className="evt-form-success">
        <div className="evt-form-success-title">You're registered!</div>
        <div style={{ fontSize: 13 }}>
          {result.team.players.map((p) => p.name).join(", ")} — {money(tournament.costPerPlayer)} per player.
        </div>
        {(payment.allowCheckPayment || payment.allowInPersonPayment || payment.payOnlineAvailable) && result.payUrl ? (
          <div style={{ fontSize: 12.5 }}>
            When you're ready, <a href={result.payUrl}>pay for your team here</a>.
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--evt-ink-muted)" }}>The organizer will follow up with payment instructions.</div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="evt-form-panel">
      <input
        type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true"
      />
      <input className="evt-input" placeholder="Team name (optional)" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
      {players.map((p, i) => (
        <div key={i} className="evt-form-row">
          <input className="evt-input" style={{ flex: "1 1 140px" }} required placeholder={i === 0 ? "Your name" : "Player name"} value={p.name} onChange={(e) => setPlayer(i, "name", e.target.value)} />
          <input className="evt-input" style={{ flex: "1 1 160px" }} type="email" placeholder="Email" value={p.email} onChange={(e) => setPlayer(i, "email", e.target.value)} />
          <input className="evt-input" style={{ flex: "1 1 120px" }} required placeholder="Phone" value={formatPhone(p.phone)} onChange={(e) => setPlayer(i, "phone", stripPhone(e.target.value))} />
          {players.length > 1 && (
            <label className="evt-radio-label">
              <input type="radio" name="tournament-team-captain" checked={p.isCaptain} onChange={() => setCaptain(i)} /> Team captain
            </label>
          )}
          {players.length > 1 && <button type="button" className="evt-btn-ghost evt-btn-ghost-remove" onClick={() => removePlayerRow(i)}>Remove</button>}
        </div>
      ))}
      {players.length < tournament.maxTeamSize && (
        <div><button type="button" className="evt-btn-ghost" onClick={addPlayerRow}>+ Add another player</button></div>
      )}
      {error && <div className="evt-form-error">{error}</div>}
      <div className="evt-form-row">
        <button type="submit" className="evt-btn-sm" disabled={busy}>{busy ? "Registering…" : "Register"}</button>
        <button type="button" className="evt-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Centered({ children, embed }) {
  return (
    <div style={{ minHeight: embed ? "auto" : "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: embed ? "transparent" : colors.bg, padding: embed ? 20 : 0 }}>
      <div style={{ fontSize: 13.5, color: colors.textSecondary, fontFamily: "sans-serif" }}>{children}</div>
    </div>
  );
}
