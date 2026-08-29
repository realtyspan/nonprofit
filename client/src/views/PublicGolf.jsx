import React, { useEffect, useRef, useState } from "react";
import { colors, card, button, input as inputStyle, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import { formatPhone, stripPhone } from "../lib/phone";
import logo from "../assets/logo.png";
import defaultFlyerImage from "../assets/golf-default-flyer.jpg";

function emptyPlayer(isCaptain) {
  return { name: "", email: "", phone: "", isCaptain };
}

// Design: "Handoff — Event embed, option 1b (wide: photo band + stat rail +
// footer CTA)" from Claude Design (signed off by the org). Scoped entirely
// under .evt so host-site styles can't leak in and this can't leak out —
// injected once per page, not per card. Every value below the .evt block is
// the design's own default; per-embed overrides (from the existing
// PublicLinkBox theme query params) are applied as inline custom properties
// on each .evt root instead of edited here, so a redeploy of this component
// never has to touch the signed-off spacing/type/hairline values.
const EVT_CSS = `
.evt {
  --evt-accent:        #968ae0;
  --evt-accent-deep:   #5d5294;
  --evt-accent-tint:   #d2cefd;
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

.evt-body {
  display: flex; gap: 56px; flex-wrap: wrap;
  align-items: flex-start; padding: 34px 44px 30px;
}
.evt-details { flex: 1; min-width: 300px; display: flex; flex-direction: column; gap: 12px; }
.evt-line {
  display: flex; align-items: center; gap: 9px;
  font-size: 14px; line-height: 1.6; color: var(--evt-ink-2);
}
.evt-line-muted { color: var(--evt-ink-muted); }
.evt-strong { font-weight: 500; color: var(--evt-ink); }
.evt-ico { width: 17px; height: 17px; flex: none; color: var(--evt-accent-deep); }
.evt-ico-muted { color: var(--evt-label); }
.evt-line a { color: var(--evt-accent-deep); text-underline-offset: 3px; }
.evt-line a:hover { color: var(--evt-accent); }

.evt-action { display: flex; flex-direction: column; gap: 12px; align-items: flex-end; }
.evt-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  padding: 18px 34px; border-radius: var(--evt-radius-sm);
  font-size: 16px; font-weight: 500; line-height: 1; letter-spacing: -.005em;
  font-family: inherit; cursor: pointer; text-decoration: none;
  background: var(--evt-accent-deep); color: var(--evt-btn-fg);
  border: 1px solid var(--evt-accent-deep);
  transition: background .16s, border-color .16s;
}
.evt-btn:hover  { background: #4b4278; border-color: #4b4278; }
.evt-btn:active { background: #3f3866; border-color: #3f3866; }
.evt :focus-visible { outline: 2px solid var(--evt-accent); outline-offset: 2px; }

.evt-spots {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; line-height: 1.6; color: var(--evt-ink-muted);
}
.evt-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--evt-accent); flex: none; }
.evt-full { font-size: 13px; font-weight: 600; color: #b3261e; }

.evt-formwrap { padding: 0 44px 34px; }

@media (max-width: 780px) {
  .evt { --evt-hero-h: 200px; }
  .evt-title { font-size: 32px; }
  .evt-hero-text { left: 22px; right: 22px; bottom: 22px; }
  .evt-rail { grid-template-columns: 1fr !important; }
  .evt-rail-cell {
    padding: 18px 22px; border-right: 0; border-bottom: 1px solid var(--evt-line);
  }
  .evt-rail-cell:first-child { padding-left: 22px; }
  .evt-rail-cell:last-child  { border-bottom: 0; }
  .evt-body { padding: 24px 22px 26px; gap: 26px; }
  .evt-action { align-items: stretch; width: 100%; }
  .evt-btn { width: 100%; }
  .evt-spots { justify-content: center; }
  .evt-formwrap { padding: 0 22px 26px; }
}
`;

// Maps the app's existing embed-theme query params (accent/surface/bg/text/
// textSecondary/border/font — see PublicLinkBox's customizer + embedTheme.js)
// onto this design's --evt-* surface. Only params actually present in the
// URL are set here; everything else falls through to EVT_CSS's own defaults.
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
// Added to match the flag/clock/phone set (same 256 viewBox, 18 stroke
// width, round caps/joins) — not part of the original handoff's three
// icons, since the date used to live as text on the hero photo instead of
// as a detail line.
function CalendarIcon() {
  return (
    <svg className="evt-ico" viewBox="0 0 256 256" aria-hidden="true">
      <rect x="32" y="48" width="192" height="160" rx="16" fill="none" stroke="currentColor" strokeWidth="18" strokeLinejoin="round" />
      <path d="M32 96h192" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      <path d="M80 24v48M176 24v48" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="evt-ico" viewBox="0 0 256 256" aria-hidden="true">
      <circle cx="128" cy="128" r="94" fill="none" stroke="currentColor" strokeWidth="18" />
      <path d="M128 72v56h48" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg className="evt-ico evt-ico-muted" viewBox="0 0 256 256" aria-hidden="true">
      <path d="M96 40H56a16 16 0 0 0-16 16c0 88 72 160 160 160a16 16 0 0 0 16-16v-40l-48-24-24 32a144 144 0 0 1-56-56l32-24Z" fill="none" stroke="currentColor" strokeWidth="18" strokeLinejoin="round" />
    </svg>
  );
}

export default function PublicGolf({ slug, embed }) {
  const [page, setPage] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [openTournamentId, setOpenTournamentId] = useState(null);
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font || "Inter");

  useEffect(() => {
    publicApi.getGolfPage(slug).then(setPage).catch((err) => setLoadError(err.message));
  }, [slug]);

  // Tells the host page how tall the content actually is, so its listener
  // script (see PublicLinkBox's generated snippet) can resize the iframe
  // instead of leaving it at a fixed height that clips or wastes space.
  useEffect(() => {
    if (!embed || !containerRef.current) return;
    const el = containerRef.current;
    const post = () => postEmbedResize(el.scrollHeight);
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed, page, openTournamentId]);

  if (loadError) return <Centered embed={embed}>This page isn't available.</Centered>;
  if (!page) return <Centered embed={embed}>Loading…</Centered>;

  return (
    <div
      ref={containerRef}
      style={{ minHeight: embed ? "auto" : "100vh", background: embed ? (theme.bg || "transparent") : colors.bg }}
    >
      <style>{EVT_CSS}</style>

      {!embed && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "sans-serif" }}>{page.orgName} — Golf Tournament</div>
        </header>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {page.tournaments.length === 0 && (
            <div style={{ ...card, fontSize: 13.5, color: colors.textSecondary, fontFamily: "sans-serif" }}>No tournaments are open for registration right now.</div>
          )}

          {page.tournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              slug={slug}
              theme={theme}
              font={font}
              expanded={openTournamentId === tournament.id}
              onToggle={() => setOpenTournamentId(openTournamentId === tournament.id ? null : tournament.id)}
            />
          ))}
        </div>
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

function TournamentCard({ tournament, slug, theme, font, expanded, onToggle }) {
  // Every tournament shows a hero photo now — the org's own upload if they
  // have one, otherwise Charity Pulse's own default golf graphic (uploaded
  // once, on the platform's own org, and baked in here as a static asset so
  // every other org's registration page never renders with no image at all).
  // A tournament with its own photo keeps its own crop position; the
  // platform default always crops from the top, matching how it was
  // originally cropped/verified.
  const heroImage = tournament.flyerImage || defaultFlyerImage;
  const heroPosition = tournament.flyerImage ? (tournament.flyerImagePosition || "center") : "top";
  const kicker = new Date(tournament.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const contactBits = [tournament.contactName, tournament.contactPhone, tournament.contactEmail].filter(Boolean).length > 0;
  const railCells = [
    tournament.format && "format",
    "entry", // always present — costPerPlayer is required
    tournament.venueName && "venue",
  ].filter(Boolean);

  return (
    <div className="evt" style={evtStyleVars(theme, font)}>
      <div className="evt-card">
        <div className="evt-hero">
          <img className="evt-hero-img" src={heroImage} alt="" style={{ objectPosition: `center ${heroPosition}` }} />
          <div className="evt-hero-scrim" />
          <div className="evt-hero-text">
            <h2 className="evt-title">{tournament.name}</h2>
          </div>
        </div>

        <div className="evt-rail" style={{ gridTemplateColumns: `repeat(${railCells.length}, minmax(0, 1fr))` }}>
          <RailCell label="Format" value={tournament.format} />
          <RailCell label="Entry" value={`${money(tournament.costPerPlayer)} per player`} />
          <RailCell label="Venue" value={tournament.venueName} />
        </div>

        <div className="evt-body">
          <div className="evt-details">
            {tournament.includedDescription && (
              <p className="evt-line"><FlagIcon />{tournament.includedDescription}</p>
            )}
            <p className="evt-line"><CalendarIcon />{kicker}</p>
            {tournament.scheduleText && (
              <p className="evt-line"><ClockIcon /><span><strong className="evt-strong">Schedule:</strong> {tournament.scheduleText}</span></p>
            )}
            {contactBits && (
              <p className="evt-line evt-line-muted">
                <PhoneIcon />
                <span>
                  Questions?{tournament.contactName ? ` ${tournament.contactName}` : ""}
                  {tournament.contactPhone ? <> · <a href={`tel:${tournament.contactPhone.replace(/[^\d+]/g, "")}`}>{formatPhone(tournament.contactPhone)}</a></> : null}
                  {tournament.contactEmail ? <> · <a href={`mailto:${tournament.contactEmail}`}>{tournament.contactEmail}</a></> : null}
                </span>
              </p>
            )}
          </div>

          <div className="evt-action">
            {tournament.isFull ? (
              <p className="evt-full">This tournament is full.</p>
            ) : (
              <>
                {!expanded && <button type="button" className="evt-btn" onClick={onToggle}>Register a team</button>}
                {tournament.spotsRemaining != null && (
                  <p className="evt-spots"><span className="evt-dot" />{tournament.spotsRemaining} team spot{tournament.spotsRemaining === 1 ? "" : "s"} remaining</p>
                )}
              </>
            )}
          </div>
        </div>

        {expanded && !tournament.isFull && (
          <div className="evt-formwrap">
            <RegisterForm tournament={tournament} slug={slug} onCancel={onToggle} />
          </div>
        )}
      </div>
    </div>
  );
}

// Not part of the signed-off design (the designer flagged the inline
// form/modal as a follow-up mock, not yet built) — kept in the app's normal
// visual language rather than guessing at an unreviewed extension of .evt.
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
      <div style={{ padding: 14, background: colors.successBg, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: colors.success }}>You're registered!</div>
        <div style={{ fontSize: 13 }}>
          {result.team.players.map((p) => p.name).join(", ")} — {money(tournament.costPerPlayer)} per player.
        </div>
        {(payment.allowCheckPayment || payment.allowInPersonPayment) && result.payUrl ? (
          <div style={{ fontSize: 12.5 }}>
            When you're ready, <a href={result.payUrl}>pay for your team here</a>.
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>The organizer will follow up with payment instructions.</div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "#f7f4ec", borderRadius: 8, fontFamily: "sans-serif" }}>
      <input
        type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true"
      />
      <input style={inputStyle} placeholder="Team name (optional)" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
      {players.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inputStyle, flex: "1 1 140px" }} required placeholder={i === 0 ? "Your name" : "Player name"} value={p.name} onChange={(e) => setPlayer(i, "name", e.target.value)} />
          <input style={{ ...inputStyle, flex: "1 1 160px" }} type="email" placeholder="Email" value={p.email} onChange={(e) => setPlayer(i, "email", e.target.value)} />
          <input style={{ ...inputStyle, flex: "1 1 120px" }} placeholder="Phone" value={formatPhone(p.phone)} onChange={(e) => setPlayer(i, "phone", stripPhone(e.target.value))} />
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

function Centered({ children, embed }) {
  return (
    <div style={{ minHeight: embed ? "auto" : "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: embed ? "transparent" : colors.bg, padding: embed ? 20 : 0 }}>
      <div style={{ fontSize: 13.5, color: colors.textSecondary, fontFamily: "sans-serif" }}>{children}</div>
    </div>
  );
}
