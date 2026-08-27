import React, { useEffect, useRef, useState } from "react";
import { colors, card, button, input as inputStyle, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import logo from "../assets/logo.png";

function emptyPlayer(isCaptain) {
  return { name: "", email: "", phone: "", isCaptain };
}

export default function PublicGolf({ slug, embed }) {
  const [page, setPage] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [openTournamentId, setOpenTournamentId] = useState(null);
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const t = { ...colors, ...theme };
  const font = params.get("font");
  useGoogleFont(font);

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

  if (loadError) return <Centered embed={embed} t={t}>This page isn't available.</Centered>;
  if (!page) return <Centered embed={embed} t={t}>Loading…</Centered>;

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: embed ? "auto" : "100vh", background: embed ? (theme.bg || "transparent") : colors.bg,
        color: t.textPrimary, fontFamily: font ? `"${font}", sans-serif` : undefined,
      }}
    >
      {!embed && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>{page.orgName} — Golf Tournament</div>
        </header>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 640, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {page.tournaments.length === 0 && (
            <div style={{ ...card, background: t.surface, border: `1px solid ${t.border}`, fontSize: 13.5, color: t.textSecondary }}>
              No tournaments are open for registration right now.
            </div>
          )}

          {page.tournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              slug={slug}
              t={t}
              expanded={openTournamentId === tournament.id}
              onToggle={() => setOpenTournamentId(openTournamentId === tournament.id ? null : tournament.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TournamentCard({ tournament, slug, expanded, onToggle, t }) {
  const cardStyle = { ...card, background: t.surface, border: `1px solid ${t.border}`, color: t.textPrimary };
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
      {tournament.flyerImage && (
        <img
          src={tournament.flyerImage} alt=""
          style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 8, margin: "-4px -4px 0" }}
        />
      )}
      <div>
        <div style={{ fontSize: 19, fontWeight: 700 }}>{tournament.name}</div>
        {tournament.format && <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 2 }}>{tournament.format}</div>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 13.5 }}>
        <div><strong>{new Date(tournament.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</strong></div>
        <div>{money(tournament.costPerPlayer)} per player</div>
        {tournament.venueName && <div>{tournament.venueName}</div>}
      </div>

      {tournament.includedDescription && (
        <div style={{ fontSize: 13, color: t.textSecondary, whiteSpace: "pre-wrap" }}>{tournament.includedDescription}</div>
      )}
      {tournament.scheduleText && (
        <div style={{ fontSize: 13, color: t.textSecondary, whiteSpace: "pre-wrap" }}><strong>Schedule:</strong> {tournament.scheduleText}</div>
      )}
      {(tournament.contactName || tournament.contactPhone || tournament.contactEmail) && (
        <div style={{ fontSize: 12.5, color: t.textSecondary }}>
          Questions? {tournament.contactName}{tournament.contactPhone ? ` · ${tournament.contactPhone}` : ""}{tournament.contactEmail ? ` · ${tournament.contactEmail}` : ""}
        </div>
      )}

      {tournament.isFull ? (
        <div style={{ fontSize: 13.5, color: colors.danger, fontWeight: 600 }}>This tournament is full.</div>
      ) : (
        <>
          {tournament.spotsRemaining != null && (
            <div style={{ fontSize: 12.5, color: t.textSecondary }}>{tournament.spotsRemaining} team spot{tournament.spotsRemaining === 1 ? "" : "s"} remaining</div>
          )}
          {!expanded ? (
            <div><button style={{ ...button.primary, background: t.accent }} onClick={onToggle}>Register a team</button></div>
          ) : (
            <RegisterForm tournament={tournament} slug={slug} onCancel={onToggle} t={t} />
          )}
        </>
      )}
    </div>
  );
}

function RegisterForm({ tournament, slug, onCancel, t }) {
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
        {(payment.allowCheckPayment || payment.allowInPersonPayment) && result.payUrl ? (
          <div style={{ fontSize: 12.5 }}>
            When you're ready, <a href={result.payUrl}>pay for your team here</a>.
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: t.textSecondary }}>The organizer will follow up with payment instructions.</div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: t.surface === colors.surface ? "#fafafa" : t.surface, border: `1px solid ${t.border}`, borderRadius: 8 }}>
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
        <button type="submit" style={{ ...button.primary, background: t.accent }} disabled={busy}>{busy ? "Registering…" : "Register"}</button>
        <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Centered({ children, embed, t }) {
  return (
    <div style={{ minHeight: embed ? "auto" : "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: embed ? "transparent" : colors.bg, padding: embed ? 20 : 0 }}>
      <div style={{ fontSize: 13.5, color: t ? t.textSecondary : colors.textSecondary }}>{children}</div>
    </div>
  );
}
