import React, { useEffect, useRef, useState } from "react";
import { colors, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import { formatPhone, stripPhone } from "../lib/phone";
import logo from "../assets/logo.png";

function emptyPlayer(isCaptain) {
  return { name: "", email: "", phone: "", isCaptain };
}

// Direct port of PublicGolf.jsx's .evt design system and TournamentCard +
// RegisterForm, generalized off golf. One tournament per page (this module
// supports several open at once, each with its own URL — see
// PublicTournaments.jsx for the index), so unlike PublicGolf.jsx this
// never needs to track "which card is expanded" across several. The
// "have you played before" lookup step and the empty-state/notify-me flow
// are deliberately not ported yet — see the plan doc's slice-1 scope.
const EVT_CSS = `
.evt {
  --evt-accent:        #968ae0;
  --evt-accent-deep:   #5d5294;
  --evt-surface:       #f3f5fe;
  --evt-surface-alt:   #cfd3e5;
  --evt-ink:           #1e2028;
  --evt-ink-2:         #3f424d;
  --evt-ink-muted:     #75798c;
  --evt-label:         #9397ab;
  --evt-line:          rgba(41, 43, 49, .10);
  --evt-radius:        14px;
  --evt-radius-sm:     8px;
  --evt-font:          "Inter", system-ui, -apple-system, sans-serif;
  --evt-btn-fg:        #f5f4ff;
  --evt-shadow:        0 1px 2px rgba(41,43,49,.05), 0 14px 34px rgba(41,43,49,.06);
  --evt-hero-h:        280px;

  font-family: var(--evt-font);
  color: var(--evt-ink-2);
  -webkit-font-smoothing: antialiased;
}
.evt *, .evt *::before, .evt *::after { box-sizing: border-box; }
.evt p, .evt h2, .evt h3 { margin: 0; }
.evt img { display: block; max-width: 100%; }

.evt-card {
  background: var(--evt-surface);
  border: 1px solid rgba(41,43,49,.09);
  border-radius: var(--evt-radius);
  overflow: hidden;
  box-shadow: var(--evt-shadow);
}

.evt-hero { position: relative; height: var(--evt-hero-h); background: var(--evt-surface-alt); }
.evt-hero-img { width: 100%; height: 100%; object-fit: cover; }
.evt-hero-scrim {
  position: absolute; inset: auto 0 0 0; height: 150px; pointer-events: none;
  background: linear-gradient(to top, rgba(30,32,40,.72), transparent);
}
.evt-hero-text {
  position: absolute; left: 44px; right: 44px; bottom: 30px;
  display: flex; flex-direction: column; gap: 10px; pointer-events: none;
}
.evt-hero .evt-title { color: var(--evt-surface); }
.evt-title-plain { padding: 34px 44px 0; }
.evt-title-plain .evt-title { color: var(--evt-ink); }

.evt-title {
  font-size: 46px; font-weight: 500; line-height: 1.04;
  letter-spacing: -.022em; color: var(--evt-ink);
  text-wrap: pretty;
}

.evt-rail {
  display: grid;
  border-bottom: 1px solid var(--evt-line);
}
.evt-rail-cell {
  padding: 26px 40px; display: flex; flex-direction: column; gap: 7px;
  border-right: 1px solid var(--evt-line);
}
.evt-rail-cell:first-child { padding-left: 44px; }
.evt-rail-cell:last-child  { border-right: 0; }
.evt-label {
  font-size: 10px; font-weight: 500; line-height: 1;
  letter-spacing: .13em; text-transform: uppercase; color: var(--evt-label);
}
.evt-value {
  font-size: 17px; font-weight: 500; line-height: 1.25;
  letter-spacing: -.01em; color: var(--evt-ink);
}

.evt-body { padding: 34px 44px 30px; display: flex; flex-direction: column; gap: 30px; }
.evt-strong { font-weight: 500; color: var(--evt-ink); }
.evt-ico { width: 17px; height: 17px; flex: none; color: var(--evt-accent-deep); }

.evt-section { display: flex; flex-direction: column; gap: 14px; }
.evt-section-title { display: flex; align-items: center; gap: 9px; font-size: 15px; }

.evt-top-row { display: flex; gap: 32px; align-items: flex-start; }
.evt-included-col, .evt-schedule-col { flex: 1; min-width: 0; }
.evt-included-grid { display: flex; flex-direction: column; gap: 10px; }
.evt-included-item {
  display: flex; align-items: center; gap: 10px;
  background: color-mix(in srgb, var(--evt-accent) 18%, white);
  border-radius: 10px; padding: 13px 14px;
  font-size: 14px; color: var(--evt-ink); line-height: 1.3;
}
.evt-included-check { width: 19px; height: 19px; flex: none; color: var(--evt-accent-deep); }

.evt-date-pill {
  display: inline-flex; width: fit-content; padding: 10px 18px;
  background: var(--evt-accent-deep); color: var(--evt-btn-fg);
  border-radius: 8px; font-size: 14px; font-weight: 600;
}
.evt-timeline { display: flex; flex-direction: column; }
.evt-timeline-row {
  display: grid; grid-template-columns: 82px 1px 1fr; gap: 16px; align-items: center;
  padding: 9px 0;
}
.evt-timeline-row + .evt-timeline-row { border-top: 1px solid var(--evt-line); }
.evt-timeline-time { font-weight: 700; color: var(--evt-accent-deep); font-size: 14px; }
.evt-timeline-rule { align-self: stretch; border-left: 1px dashed var(--evt-line); }
.evt-timeline-label { font-size: 14px; color: var(--evt-ink-2); }

.evt-footer {
  background: color-mix(in srgb, var(--evt-accent) 18%, white); border-top: 1px solid var(--evt-line);
  padding: 18px 44px; display: flex; justify-content: flex-end; align-items: center; gap: 16px; flex-wrap: wrap;
}
.evt-footer-contact { display: flex; flex-direction: column; gap: 2px; margin-right: auto; }
.evt-footer-contact-label { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--evt-label); }
.evt-footer-contact-name { font-size: 13.5px; font-weight: 700; color: var(--evt-ink); margin-top: 1px; }
.evt-footer-contact a { font-size: 12.5px; color: var(--evt-ink-muted); text-decoration: none; }
.evt-footer-contact a:hover { text-decoration: underline; }
.evt-footer-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.evt-spots {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; line-height: 1.6; color: var(--evt-ink-muted);
}
.evt-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--evt-accent); flex: none; }
.evt-full { font-size: 13px; font-weight: 600; color: #b3261e; }
.evt-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  padding: 14px 30px; border-radius: var(--evt-radius-sm);
  font-size: 15px; font-weight: 500; line-height: 1; letter-spacing: -.005em;
  font-family: inherit; cursor: pointer; text-decoration: none;
  background: var(--evt-accent-deep); color: var(--evt-btn-fg);
  border: 1px solid var(--evt-accent-deep);
  transition: background .16s, border-color .16s;
}
.evt-btn:hover  { background: #4b4278; border-color: #4b4278; }
.evt-btn:active { background: #3f3866; border-color: #3f3866; }
.evt :focus-visible { outline: 2px solid var(--evt-accent); outline-offset: 2px; }

.evt-formwrap { padding: 0 44px 34px; }

.evt-form-panel { background: var(--evt-surface); border-radius: var(--evt-radius-sm); padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.evt-input {
  width: 100%; padding: 10px 12px; border-radius: var(--evt-radius-sm);
  border: 1px solid var(--evt-line); font-size: 14px; font-family: inherit; color: var(--evt-ink);
  background: #fff;
}
.evt-input:focus-visible { outline: 2px solid var(--evt-accent); outline-offset: 1px; }
.evt-form-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.evt-btn-sm {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 20px; border-radius: var(--evt-radius-sm);
  font-size: 13.5px; font-weight: 500; font-family: inherit; cursor: pointer; text-decoration: none;
  background: var(--evt-accent-deep); color: var(--evt-btn-fg); border: 1px solid var(--evt-accent-deep);
}
.evt-btn-sm:disabled { opacity: .6; cursor: default; }
.evt-btn-ghost {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 20px; border-radius: var(--evt-radius-sm);
  font-size: 13.5px; font-weight: 500; font-family: inherit; cursor: pointer;
  background: transparent; color: var(--evt-ink-muted); border: 1px solid var(--evt-line);
}
.evt-btn-ghost:hover { background: rgba(0,0,0,.03); }
.evt-btn-ghost:disabled { opacity: .6; cursor: default; }
.evt-btn-ghost-remove { color: #b3261e; padding: 5px 10px; font-size: 12px; }
.evt-radio-label { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--evt-ink-muted); white-space: nowrap; }
.evt-form-error { color: #b3261e; font-size: 12.5px; }
.evt-form-success { background: color-mix(in srgb, var(--evt-accent) 14%, white); border-radius: var(--evt-radius-sm); padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.evt-form-success-title { font-size: 14.5px; font-weight: 700; color: var(--evt-accent-deep); }
.evt-form-success a { color: var(--evt-accent-deep); }

@media (max-width: 780px) {
  .evt { --evt-hero-h: 200px; }
  .evt-title { font-size: 32px; }
  .evt-hero-text { left: 22px; right: 22px; bottom: 22px; }
  .evt-title-plain { padding: 22px 22px 0; }
  .evt-rail { grid-template-columns: 1fr !important; }
  .evt-rail-cell {
    padding: 18px 22px; border-right: 0; border-bottom: 1px solid var(--evt-line);
  }
  .evt-rail-cell:first-child { padding-left: 22px; }
  .evt-rail-cell:last-child  { border-bottom: 0; }
  .evt-body { padding: 24px 22px 26px; }
  .evt-top-row { flex-direction: column; }
  .evt-footer { padding: 16px 22px; flex-direction: column; align-items: stretch; }
  .evt-footer-contact { margin-right: 0; text-align: center; align-items: center; }
  .evt-footer-actions { justify-content: center; }
  .evt-btn { width: 100%; }
  .evt-formwrap { padding: 0 22px 26px; }
}
`;

function evtStyleVars(theme, font) {
  const vars = {};
  if (theme.accent) { vars["--evt-accent"] = theme.accent; vars["--evt-accent-deep"] = theme.accent; }
  if (theme.surface) vars["--evt-surface"] = theme.surface;
  if (theme.textPrimary) { vars["--evt-ink"] = theme.textPrimary; vars["--evt-ink-2"] = theme.textPrimary; }
  if (theme.textSecondary) { vars["--evt-ink-muted"] = theme.textSecondary; vars["--evt-label"] = theme.textSecondary; }
  if (theme.border) vars["--evt-line"] = theme.border;
  if (font) vars["--evt-font"] = `"${font}", system-ui, -apple-system, sans-serif`;
  return vars;
}

function FlagIcon() {
  return (
    <svg className="evt-ico" viewBox="0 0 256 256" aria-hidden="true">
      <path d="M40 32v184M40 48h150l-30 44 30 44H40" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className="evt-ico" viewBox="0 0 256 256" aria-hidden="true">
      <rect x="32" y="48" width="192" height="160" rx="16" fill="none" stroke="currentColor" strokeWidth="18" strokeLinejoin="round" />
      <path d="M32 96h192" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      <path d="M80 24v48M176 24v48" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="evt-included-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

function RailCell({ label, value }) {
  if (!value) return null;
  return (
    <div className="evt-rail-cell">
      <p className="evt-label">{label}</p>
      <p className="evt-value">{value}</p>
    </div>
  );
}

function TournamentVisual({ tournament }) {
  const railCells = [
    tournament.format && "format",
    "entry",
    tournament.venueName && "venue",
  ].filter(Boolean);
  const dateLabel = new Date(tournament.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <>
      {tournament.flyerImage ? (
        <div className="evt-hero">
          <img className="evt-hero-img" src={tournament.flyerImage} alt="" style={{ objectPosition: `center ${tournament.flyerImagePosition || "center"}` }} />
          <div className="evt-hero-scrim" />
          <div className="evt-hero-text">
            <h2 className="evt-title">{tournament.name}</h2>
          </div>
        </div>
      ) : (
        <div className="evt-title-plain">
          <h2 className="evt-title">{tournament.name}</h2>
        </div>
      )}

      <div className="evt-rail" style={{ gridTemplateColumns: `repeat(${railCells.length}, minmax(0, 1fr))` }}>
        <RailCell label="Format" value={tournament.format} />
        <RailCell label="Entry" value={`${money(tournament.costPerPlayer)} per player`} />
        <RailCell label="Venue" value={tournament.venueName} />
      </div>

      <div className="evt-body">
        <div className="evt-top-row">
          {tournament.includedItems?.length > 0 && (
            <div className="evt-included-col evt-section">
              <p className="evt-section-title"><FlagIcon /><strong className="evt-strong">What's Included</strong></p>
              <div className="evt-included-grid">
                {tournament.includedItems.map((item, i) => (
                  <div key={i} className="evt-included-item"><CheckIcon />{item}</div>
                ))}
              </div>
            </div>
          )}
          <div className="evt-schedule-col evt-section">
            <p className="evt-section-title"><CalendarIcon /><strong className="evt-strong">Schedule</strong></p>
            <div className="evt-date-pill">{dateLabel}</div>
            {tournament.scheduleItems?.length > 0 && (
              <div className="evt-timeline">
                {tournament.scheduleItems.map((item, i) => (
                  <div key={i} className="evt-timeline-row">
                    <span className="evt-timeline-time">{item.time}</span>
                    <span className="evt-timeline-rule" />
                    <span className="evt-timeline-label">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function FooterContact({ tournament }) {
  const contactBits = [tournament.contactName, tournament.contactPhone, tournament.contactEmail].filter(Boolean).length > 0;
  if (!contactBits) return null;
  return (
    <div className="evt-footer-contact">
      <p className="evt-footer-contact-label">Have Questions?</p>
      {tournament.contactName && <p className="evt-footer-contact-name">{tournament.contactName}</p>}
      {tournament.contactPhone && <a href={`tel:${tournament.contactPhone.replace(/[^\d+]/g, "")}`}>{formatPhone(tournament.contactPhone)}</a>}
      {tournament.contactEmail && <a href={`mailto:${tournament.contactEmail}`}>{tournament.contactEmail}</a>}
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
