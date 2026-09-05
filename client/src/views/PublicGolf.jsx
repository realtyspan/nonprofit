import React, { useEffect, useRef, useState } from "react";
import { colors, card, money } from "../lib/tokens";
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

/* The "no active tournament" notice on PreviewTournamentCard — sits right
   under the hero, ahead of the format/entry/venue rail and the typical-
   format details below it, so it's the first thing read after the photo
   instead of a small aside a visitor could scroll past. Bold accent-tinted
   text (same tint recipe as .evt-included-item/.evt-footer) rather than the
   card's own muted body copy, specifically so it can't blend in. */
.evt-notice {
  padding: 16px 44px;
  background: color-mix(in srgb, var(--evt-accent) 22%, white);
  border-bottom: 1px solid var(--evt-line);
  font-size: 14.5px; font-weight: 700; line-height: 1.5;
  color: var(--evt-accent-deep);
}

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
.evt-ico-muted { color: var(--evt-label); }

/* Section heading, shared by "What's Included" and "Schedule" */
.evt-section { display: flex; flex-direction: column; gap: 14px; }
.evt-section-title { display: flex; align-items: center; gap: 9px; font-size: 15px; }

/* What's Included + Schedule, side by side as two equal columns — was
   Included + a dark contact card side by side, with Schedule stretched
   full-width alone underneath (leaving its rows nothing to sit next to).
   Contact info now lives in the footer instead (see .evt-footer-contact). */
.evt-top-row { display: flex; gap: 32px; align-items: flex-start; }
.evt-included-col, .evt-schedule-col { flex: 1; min-width: 0; }
/* Single column (was a 2-up grid) — matches the flyer PDF's own layout. */
.evt-included-grid { display: flex; flex-direction: column; gap: 10px; }
.evt-included-item {
  display: flex; align-items: center; gap: 10px;
  /* A light tint mixed live from the accent, rather than a separate custom
     property — so an org overriding --evt-accent (see evtStyleVars) never
     ends up with a stale tint that clashes with their own color. */
  background: color-mix(in srgb, var(--evt-accent) 18%, white);
  border-radius: 10px; padding: 13px 14px;
  font-size: 14px; color: var(--evt-ink); line-height: 1.3;
}
.evt-included-check { width: 19px; height: 19px; flex: none; color: var(--evt-accent-deep); }

/* Schedule: a highlighted date pill (always shown — the date itself is
   required data, even when no hour-by-hour agenda was entered), then an
   optional time/label timeline below it. */
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
/* Was var(--evt-ink) — each time now reads in the accent color, matching
   the flyer PDF's own schedule-time treatment. */
.evt-timeline-time { font-weight: 700; color: var(--evt-accent-deep); font-size: 14px; }
.evt-timeline-rule { align-self: stretch; border-left: 1px dashed var(--evt-line); }
.evt-timeline-label { font-size: 14px; color: var(--evt-ink-2); }

.evt-footer {
  background: color-mix(in srgb, var(--evt-accent) 18%, white); border-top: 1px solid var(--evt-line);
  padding: 18px 44px; display: flex; justify-content: flex-end; align-items: center; gap: 16px; flex-wrap: wrap;
}
/* Replaces the old dark "Have Questions?" card that used to sit in the
   body next to What's Included — light-on-light to match this bar's own
   tinted background instead of a dark card. margin-right:auto pushes the
   actions group (spots + button) to the end, same trick .evt-spots used
   to do on its own before this existed. */
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

/* The registration form itself, restyled onto .evt's own tokens — it used
   to render with the app's own default teal/terracotta buttons regardless
   of the card's actual accent color (default lavender, or an org's own
   override), which is exactly what looked "off" once you opened it: every
   other button/pill on the card already reads in --evt-accent, and this
   was the one part of the embed that never did. */
.evt-form-panel { background: var(--evt-surface); border-radius: var(--evt-radius-sm); padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.evt-form-note { font-size: 13px; color: var(--evt-ink-muted); line-height: 1.5; }
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
  .evt-notice { padding: 14px 22px; }
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
function CheckIcon() {
  return (
    <svg className="evt-included-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
  // Lets an admin see exactly what a visitor sees when no tournament is
  // open, without actually closing (or deleting) a real one to get there —
  // see ManageGolfTournaments.jsx's "Preview" link, which is the only place
  // this param is ever set. Harmless if a visitor stumbles onto it directly:
  // it only ever surfaces the same public-safe fields the real embed already
  // shows, just forced into the empty-state layout.
  const forcePreview = params.get("preview") === "empty";

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

  const showEmptyState = forcePreview || page.tournaments.length === 0;
  // Normally the server's own previewTournament (the org's most recent real
  // tournament) is the only source for this — it's null exactly when there's
  // nothing to show. Force-previewing while a real tournament IS open has no
  // equivalent on the server (there's nothing "most recent and not open" to
  // find), so it falls back to that open tournament's own data instead —
  // still real data, just displayed in the empty-state layout for a look.
  const previewSource = page.previewTournament || (forcePreview ? page.tournaments[0] : null);

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

      {forcePreview && (
        <div style={{ background: "#5A4900", color: "#FFF7DD", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "8px 16px", fontFamily: "sans-serif" }}>
          Preview mode — this is what visitors see when no tournament is open. Not shown to real visitors, and the "Notify Me" form below won't actually submit.
        </div>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {showEmptyState ? (
            previewSource ? (
              // The "no active tournament" message now lives inside the card
              // itself (see PreviewTournamentCard's `notice`), right under the
              // hero — a small muted box floating above the whole card was
              // easy to miss entirely before scrolling into the card below it.
              <PreviewTournamentCard
                tournament={previewSource}
                slug={slug}
                theme={theme}
                font={font}
                previewOnly={forcePreview}
                expanded={openTournamentId === "preview"}
                onToggle={() => setOpenTournamentId(openTournamentId === "preview" ? null : "preview")}
              />
            ) : (
              <div style={{ ...card, fontSize: 13.5, color: colors.textSecondary, fontFamily: "sans-serif" }}>
                No tournaments are open for registration right now.
              </div>
            )
          ) : (
            page.tournaments.map((tournament) => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                slug={slug}
                theme={theme}
                font={font}
                expanded={openTournamentId === tournament.id}
                onToggle={() => setOpenTournamentId(openTournamentId === tournament.id ? null : tournament.id)}
              />
            ))
          )}
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

// Hero + rail + What's Included/Schedule body — the part every card shares
// regardless of whether its footer offers real registration (TournamentCard)
// or a "notify me" signup (PreviewTournamentCard). `isPreview` swaps the
// date pill for a generic "Typical schedule" label instead of the source
// tournament's actual past date, since a specific date on a card that isn't
// actually open would read as a real upcoming event rather than an example.
// `notice`, when given, renders a bold attention-grabbing banner right
// under the hero and ahead of everything else — used by PreviewTournamentCard
// for the "no active tournament" message, which was getting missed entirely
// as a small, separate, muted-color box above the whole card.
function TournamentVisual({ tournament, isPreview, notice }) {
  // Every tournament shows a hero photo now — the org's own upload if they
  // have one, otherwise Charity Pulse's own default golf graphic (uploaded
  // once, on the platform's own org, and baked in here as a static asset so
  // every other org's registration page never renders with no image at all).
  // A tournament with its own photo keeps its own crop position; the
  // platform default always crops from the top, matching how it was
  // originally cropped/verified.
  const heroImage = tournament.flyerImage || defaultFlyerImage;
  const heroPosition = tournament.flyerImage ? (tournament.flyerImagePosition || "center") : "top";
  const kicker = isPreview
    ? "Typical schedule"
    : new Date(tournament.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const railCells = [
    tournament.format && "format",
    "entry", // always present — costPerPlayer is required
    tournament.venueName && "venue",
  ].filter(Boolean);

  return (
    <>
      <div className="evt-hero">
        <img className="evt-hero-img" src={heroImage} alt="" style={{ objectPosition: `center ${heroPosition}` }} />
        <div className="evt-hero-scrim" />
        <div className="evt-hero-text">
          {/* The source tournament's own name is reported directly as
              confusing here — for a currently-open tournament being
              force-previewed (see PublicGolf's forcePreview), it read as
              though that specific real, active event had no active
              tournament. A fixed generic heading makes clear this card is
              an illustration, not a specific real event, regardless of
              which tournament's data it's borrowing. */}
          <h2 className="evt-title">{isPreview ? "No Active Golf Tournament" : tournament.name}</h2>
        </div>
      </div>

      {notice && <div className="evt-notice">{notice}</div>}

      <div className="evt-rail" style={{ gridTemplateColumns: `repeat(${railCells.length}, minmax(0, 1fr))` }}>
        <RailCell label="Format" value={tournament.format} />
        <RailCell label="Entry" value={`${money(tournament.costPerPlayer)} per player`} />
        <RailCell label="Venue" value={tournament.venueName} />
      </div>

      <div className="evt-body">
        {/* Side by side as two equal columns. What's Included only
            renders when there's something to show; Schedule always
            renders — the date pill covers every tournament (date is
            required data), with the timeline below it appearing once a
            detailed schedule has actually been entered. */}
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
            <div className="evt-date-pill">{kicker}</div>
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

// Shared by both footers — a tournament's contact info, light-on-light to
// match the footer's own tinted background.
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

function TournamentCard({ tournament, slug, theme, font, expanded, onToggle }) {
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
            <RegisterForm tournament={tournament} slug={slug} onCancel={onToggle} />
          </div>
        )}
      </div>
    </div>
  );
}

// Shown in place of TournamentCard when no tournament is currently open —
// same visual card, built from the org's own most recent real tournament
// (see publicGolf.js's GET /:slug), but with the footer's register button
// replaced by a lightweight "notify me" signup, since there's nothing to
// actually register for yet.
function PreviewTournamentCard({ tournament, slug, theme, font, previewOnly, expanded, onToggle }) {
  return (
    <div className="evt" style={evtStyleVars(theme, font)}>
      <div className="evt-card">
        <TournamentVisual
          tournament={tournament}
          isPreview
          notice="We don't have an active golf tournament scheduled right now. Our typical format is shown below — register your interest and we'll reach out as soon as registration opens for players and sponsors."
        />

        <div className="evt-footer">
          <FooterContact tournament={tournament} />
          <div className="evt-footer-actions">
            {!expanded && <button type="button" className="evt-btn" onClick={onToggle}>Notify me</button>}
          </div>
        </div>

        {expanded && (
          <div className="evt-formwrap">
            <NotifyForm slug={slug} onCancel={onToggle} previewOnly={previewOnly} />
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
  // "Have you played with us before?" gate, ahead of the real form — see
  // lookup-player's own comment in publicGolf.js for why an exact-match-only
  // lookup that returns just a name is the safe version of this. Skipping is
  // always available (someone brand new shouldn't have to opt out of a
  // question that doesn't apply to them).
  const [step, setStep] = useState("lookup"); // "lookup" | "form"
  const [lookupValue, setLookupValue] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState([emptyPlayer(true)]);
  const [website, setWebsite] = useState(""); // honeypot — real visitors never see this field
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function submitLookup(e) {
    e.preventDefault();
    const isEmail = lookupValue.includes("@");
    setLookupBusy(true);
    const { name } = await publicApi.lookupGolfPlayer(slug, isEmail ? { email: lookupValue } : { phone: lookupValue });
    setPlayers([{ name, email: isEmail ? lookupValue : "", phone: isEmail ? "" : lookupValue, isCaptain: true }]);
    setLookupBusy(false);
    setStep("form");
  }

  function setPlayer(i, k, v) {
    setPlayers((ps) => ps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }
  // Radio-button semantics, not independent checkboxes — exactly one
  // captain, never zero or several by accident.
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
      // Removing the captain shouldn't leave the team with none — promote
      // whoever's now first rather than surface that as an error.
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
      const res = await publicApi.registerGolfTeam(slug, tournament.id, { teamName, players, website });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "lookup") {
    return (
      <form onSubmit={submitLookup} className="evt-form-panel">
        <div className="evt-form-note">
          Played or sponsored with us before? Enter the email or phone number you used, and we'll fill in your name for you.
        </div>
        <input
          className="evt-input" placeholder="Email or phone" value={lookupValue}
          onChange={(e) => setLookupValue(e.target.value)} autoFocus
        />
        <div className="evt-form-row">
          <button type="submit" className="evt-btn-sm" disabled={lookupBusy || !lookupValue.trim()}>{lookupBusy ? "Checking…" : "Continue"}</button>
          <button type="button" className="evt-btn-ghost" onClick={() => setStep("form")} disabled={lookupBusy}>I'm new — skip this</button>
          <button type="button" className="evt-btn-ghost" onClick={onCancel} disabled={lookupBusy}>Cancel</button>
        </div>
      </form>
    );
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
              <input type="radio" name="golf-team-captain" checked={p.isCaptain} onChange={() => setCaptain(i)} /> Team captain
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

// The "notify me" lead-capture form shown under PreviewTournamentCard — a
// lightweight contact-only ask (no roster, no payment) since there's no real
// tournament to register for yet. Posts to publicGolf.js's POST /:slug/interest.
function NotifyForm({ slug, onCancel, previewOnly }) {
  const [role, setRole] = useState("player");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real visitors never see this field
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    if (!email.trim() && !phone.trim()) return setError("Enter an email or phone number so we can reach you");
    setBusy(true);
    setError("");
    try {
      // previewOnly (admin testing the "no active tournament" look — see
      // PublicGolf's forcePreview) skips the real submission entirely, so
      // trying it out never leaves a fake lead in the org's real signup list.
      if (!previewOnly) await publicApi.submitGolfInterest(slug, { role, name, email, phone, companyName, note, website });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="evt-form-success">
        <div className="evt-form-success-title">You're on the list!</div>
        <div style={{ fontSize: 13 }}>
          {previewOnly
            ? "(Preview only — nothing was actually submitted.)"
            : `We'll reach out to ${email.trim() || formatPhone(phone) || "you"} as soon as registration opens.`}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="evt-form-panel">
      <input
        type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true"
      />
      <div className="evt-form-row">
        <label className="evt-radio-label"><input type="radio" name="golf-interest-role" checked={role === "player"} onChange={() => setRole("player")} /> I want to play</label>
        <label className="evt-radio-label"><input type="radio" name="golf-interest-role" checked={role === "sponsor"} onChange={() => setRole("sponsor")} /> I want to sponsor</label>
      </div>
      <input className="evt-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="evt-form-row">
        <input className="evt-input" style={{ flex: "1 1 160px" }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="evt-input" style={{ flex: "1 1 120px" }} placeholder="Phone" value={formatPhone(phone)} onChange={(e) => setPhone(stripPhone(e.target.value))} />
      </div>
      {role === "sponsor" && (
        <input className="evt-input" placeholder="Company name (optional)" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      )}
      <input className="evt-input" placeholder="Anything else we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="evt-form-error">{error}</div>}
      <div className="evt-form-row">
        <button type="submit" className="evt-btn-sm" disabled={busy}>{busy ? "Submitting…" : "Notify me"}</button>
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
