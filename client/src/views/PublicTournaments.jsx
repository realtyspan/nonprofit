import React, { useEffect, useState } from "react";
import { colors, card, button, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import logo from "../assets/logo.png";

// A simple listing of every open tournament across every type — the
// multi-open-tournament index Golf doesn't have today (Golf shows "the"
// open tournament inline; here more than one, of different types, can be
// open at once). Each row links to that tournament's own full page
// (PublicTournament.jsx) rather than expanding inline.
export default function PublicTournaments({ slug, embed }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font);

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
  }, [embed, page]);

  if (error) return <Centered embed={embed}>This page isn't available.</Centered>;
  if (!page) return <Centered embed={embed}>Loading…</Centered>;

  const t = { ...colors, ...theme };

  return (
    <div style={{ minHeight: embed ? "auto" : "100vh", background: embed ? (t.bg || "transparent") : colors.bg, fontFamily: font ? `"${font}", sans-serif` : undefined }}>
      {!embed && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>{page.orgName} — Tournaments</div>
        </header>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>
        {page.tournaments.length === 0 ? (
          <div style={{ ...card, background: t.surface, color: t.textPrimary, fontSize: 13.5 }}>No tournaments are open for registration right now.</div>
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

function Centered({ children, embed }) {
  return (
    <div style={{ minHeight: embed ? 200 : "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: colors.textSecondary, fontSize: 14 }}>
      {children}
    </div>
  );
}
