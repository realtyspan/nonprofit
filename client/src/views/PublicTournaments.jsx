import React, { useEffect, useState } from "react";
import { colors, card, button, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import { formatPhone, stripPhone } from "../lib/phone";
import { EVT_CSS, evtStyleVars, TournamentVisual, FooterContact } from "../components/TournamentVisual";
import logo from "../assets/logo.png";

// A simple listing of every open tournament across every type — the
// multi-open-tournament index Golf doesn't have today (Golf shows "the"
// open tournament inline; here more than one, of different types, can be
// open at once). Each row links to that tournament's own full page
// (PublicTournament.jsx) rather than expanding inline. When nothing's
// open, falls back to the same rich preview + "Notify me" flow Golf's own
// single page already has — see PreviewTournamentCard/NotifyForm below.
export default function PublicTournaments({ slug, embed }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [notifyOpen, setNotifyOpen] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font);
  // Lets an admin see exactly what a visitor sees when nothing's open,
  // without actually closing every real tournament to get there — see
  // ManageTournaments.jsx's "Preview" link, the only place this param is
  // ever set. Same convention as Golf's own ?preview=empty.
  const forcePreview = params.get("preview") === "empty";

  useEffect(() => {
    publicApi.getTournamentsIndexPage(slug).then(setPage).catch((err) => setError(err.message));
  }, [slug]);

  useEffect(() => {
    if (!embed) return;
    const post = () => postEmbedResize(document.body.scrollHeight);
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [embed, page, notifyOpen]);

  if (error) return <Centered embed={embed}>This page isn't available.</Centered>;
  if (!page) return <Centered embed={embed}>Loading…</Centered>;

  const t = { ...colors, ...theme };
  const showEmptyState = forcePreview || page.tournaments.length === 0;
  const previewSource = page.previewTournament || (forcePreview ? page.tournaments[0] : null);

  return (
    <div style={{ minHeight: embed ? "auto" : "100vh", background: embed ? (t.bg || "transparent") : colors.bg, fontFamily: font ? `"${font}", sans-serif` : undefined }}>
      <style>{EVT_CSS}</style>

      {!embed && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>{page.orgName} — Tournaments</div>
        </header>
      )}

      {forcePreview && (
        <div style={{ background: "#5A4900", color: "#FFF7DD", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "8px 16px", fontFamily: "sans-serif" }}>
          Preview mode — this is what visitors see when nothing's open. Not shown to real visitors, and the "Notify me" form below won't actually submit.
        </div>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>
        {showEmptyState ? (
          previewSource ? (
            <PreviewTournamentCard
              tournament={previewSource}
              slug={slug}
              types={page.types || []}
              theme={theme}
              font={font}
              previewOnly={forcePreview}
              expanded={notifyOpen}
              onToggle={() => setNotifyOpen((s) => !s)}
            />
          ) : (
            <div style={{ ...card, background: t.surface, color: t.textPrimary, fontSize: 13.5 }}>No tournaments are open for registration right now.</div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {page.tournaments.map((tour) => (
              <a
                key={tour.id}
                href={`/tournaments/${slug}/${tour.slug}${embed ? `?${params.toString()}` : ""}`}
                style={{ ...card, background: t.surface, color: t.textPrimary, textDecoration: "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{tour.name}</div>
                  <div style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 2 }}>
                    {tour.typeName ? `${tour.typeName} · ` : ""}
                    {new Date(tour.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                    {tour.venueName ? ` · ${tour.venueName}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {tour.isFull ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.danger }}>Full</span>
                  ) : (
                    <span style={{ fontSize: 13, color: t.textSecondary }}>{money(tour.costPerPlayer)}/player</span>
                  )}
                  <span style={button.primary}>View & register</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Shown in place of the listing when nothing's open — same visual card a
// real open tournament shows (see components/TournamentVisual.jsx), built
// from the org's own most recent tournament, but with the register button
// replaced by a lightweight "notify me" signup. Direct port of
// PublicGolf.jsx's own PreviewTournamentCard.
function PreviewTournamentCard({ tournament, slug, types, theme, font, previewOnly, expanded, onToggle }) {
  return (
    <div className="evt" style={evtStyleVars(theme, font)}>
      <div className="evt-card">
        <TournamentVisual
          tournament={tournament}
          notice="We don't have an active tournament scheduled right now. Our typical format is shown below — register your interest and we'll reach out as soon as registration opens for players and sponsors."
        />

        <div className="evt-footer">
          <FooterContact tournament={tournament} />
          <div className="evt-footer-actions">
            {!expanded && <button type="button" className="evt-btn" onClick={onToggle}>Notify me</button>}
          </div>
        </div>

        {expanded && (
          <div className="evt-formwrap">
            <NotifyForm slug={slug} types={types} onCancel={onToggle} previewOnly={previewOnly} />
          </div>
        )}
      </div>
    </div>
  );
}

// The "notify me" lead-capture form shown under PreviewTournamentCard — a
// lightweight contact-only ask (no roster, no payment) since there's
// nothing real to register for yet. Posts to publicTournaments.js's POST
// /:orgSlug/interest. Direct port of PublicGolf.jsx's own NotifyForm, plus
// the "which tournament?" dropdown Golf never needed (it only ever runs
// one sport) — defaults to "Any tournament."
function NotifyForm({ slug, types, onCancel, previewOnly }) {
  const [role, setRole] = useState("player");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [typeId, setTypeId] = useState("");
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
      // previewOnly (admin testing the "nothing open" look — see
      // PublicTournaments' forcePreview) skips the real submission
      // entirely, so trying it out never leaves a fake lead in the org's
      // real signup list.
      if (!previewOnly) await publicApi.submitTournamentInterest(slug, { role, name, email, phone, companyName, note, typeId: typeId || null, website });
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
        <label className="evt-radio-label"><input type="radio" name="tournament-interest-role" checked={role === "player"} onChange={() => setRole("player")} /> I want to play</label>
        <label className="evt-radio-label"><input type="radio" name="tournament-interest-role" checked={role === "sponsor"} onChange={() => setRole("sponsor")} /> I want to sponsor</label>
      </div>
      {types.length > 0 && (
        <select className="evt-select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Any tournament</option>
          {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
        </select>
      )}
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
    <div style={{ minHeight: embed ? 200 : "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: colors.textSecondary, fontSize: 14 }}>
      {children}
    </div>
  );
}
