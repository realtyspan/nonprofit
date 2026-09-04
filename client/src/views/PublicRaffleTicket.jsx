import React, { useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import { colors, card, button, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { formatUtcDate } from "../lib/dates";

// Public "view & download your ticket" page — reached via the link now
// included in the electronic-ticket email (see raffle.js's send-eticket
// route and raffleEmails.js's electronicTicketHtml). Same information as
// that email, laid out as a real page instead of an email body, plus a
// "download as image" button email can't offer. ticketId is the raffle
// ticket's own id (a cuid) — already this app's de facto unguessable
// access token for a ticket, same one the email's "verification code" is
// derived from.
export default function PublicRaffleTicket({ ticketId }) {
  const [ticket, setTicket] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const cardRef = useRef(null);

  useEffect(() => {
    publicApi.getRaffleTicket(ticketId).then(setTicket).catch((err) => setLoadError(err.message));
  }, [ticketId]);

  async function downloadImage() {
    if (!cardRef.current) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const canvas = await html2canvas(cardRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Couldn't create the image");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Ticket_${(ticket.gameName || "Raffle").replace(/\s+/g, "_")}_${ticket.ticketNumber}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message || "Couldn't download the image");
    } finally {
      setDownloadBusy(false);
    }
  }

  if (loadError) return <Centered>This ticket isn't available.</Centered>;
  if (!ticket) return <Centered>Loading…</Centered>;

  // Same "dark panels / one eye-catching accent" convention as the flyer PDF
  // and golf kickoff email — see Organization.flyerPrimaryColor's own schema
  // comment — so this page automatically matches whatever brand colors the
  // org has already set for its printed/emailed material, with the same
  // app-default fallback used everywhere else that reads these two fields.
  const primary = ticket.flyerPrimaryColor || "#25555f";
  const accent = ticket.flyerAccentColor || "#cd715c";

  const contactBits = [ticket.eventVenue, ticket.eventDoorsOpenTime].filter(Boolean).length > 0;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px 60px", fontFamily: "sans-serif" }}>
      <div
        ref={cardRef}
        style={{
          width: "100%", maxWidth: 480, background: "#FFFFE8", borderRadius: 10,
          border: `3px solid ${primary}`, overflow: "hidden", boxSizing: "border-box",
        }}
      >
        <div style={{ padding: "22px 28px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: primary, letterSpacing: ".05em" }}>{(ticket.orgName || "").toUpperCase()}</div>
          {ticket.orgAddress && <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{ticket.orgAddress}</div>}
        </div>

        <div style={{ padding: "4px 28px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".02em" }}>{(ticket.gameName || "").toUpperCase()}</div>
          {ticket.prizes[0] && (
            <div style={{ fontSize: 26, fontWeight: 800, color: accent, marginTop: 8 }}>
              {money(ticket.prizes[0].amount)} TOP PRIZE
            </div>
          )}
        </div>

        <div style={{ padding: "12px 28px 0", textAlign: "center" }}>
          <div style={{ background: "#fff", border: `2px dashed ${primary}`, borderRadius: 6, padding: "16px 12px" }}>
            <div style={{ fontSize: 11, color: colors.textSecondary, letterSpacing: ".06em", textTransform: "uppercase" }}>Ticket number</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: accent, lineHeight: 1 }}>#{ticket.ticketNumber}</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: ".02em" }}>{ticket.buyerName}</div>
          </div>
        </div>

        {ticket.mainDrawingDate && (
          <div style={{ padding: "14px 28px 4px", textAlign: "center", fontSize: 14, fontWeight: 600 }}>
            Drawing: {formatUtcDate(ticket.mainDrawingDate)}
          </div>
        )}
        {ticket.earlyBirdDrawings.length > 0 && (
          <div style={{ padding: "8px 28px 4px", textAlign: "center" }}>
            {ticket.earlyBirdDrawings.map((d, i) => (
              <span key={i} style={{ display: "inline-block", background: "#FFFBEA", color: "#5A4900", fontSize: 12, padding: "4px 8px", borderRadius: 4, margin: "2px 4px", border: "1px solid #F0E4A6" }}>
                Early bird: {formatUtcDate(d.drawingDate)} · {money(d.prizeAmount)}
              </span>
            ))}
          </div>
        )}

        {ticket.admitsPerTicket > 1 && (
          <div style={{ padding: "6px 28px", textAlign: "center", fontSize: 12.5, color: colors.textSecondary }}>
            Good for {ticket.admitsPerTicket} guests
          </div>
        )}

        {ticket.prizes.length > 0 && (
          <div style={{ padding: "12px 28px 4px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: colors.textSecondary, textAlign: "center", marginBottom: 6 }}>Prizes</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px", fontSize: 12.5 }}>
              {ticket.prizes.map((p, i) => (
                <div key={i}>{p.rank} · {money(p.amount)}</div>
              ))}
            </div>
          </div>
        )}

        {contactBits && (
          <div style={{ padding: "10px 28px 4px", textAlign: "center", fontSize: 12, color: colors.textSecondary }}>
            {ticket.eventVenue}{ticket.eventVenue && ticket.eventDoorsOpenTime ? " · " : ""}{ticket.eventDoorsOpenTime && `Doors open ${ticket.eventDoorsOpenTime}`}
          </div>
        )}
        {ticket.eventDetails && (
          <div style={{ padding: "4px 28px 4px", textAlign: "center", fontSize: 11.5, color: colors.textSecondary }}>{ticket.eventDetails}</div>
        )}

        <div style={{ padding: "12px 28px", textAlign: "center" }}>
          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 4, padding: "8px 12px", fontSize: 11, color: colors.textSecondary }}>
            <strong style={{ color: colors.textPrimary }}>Please retain</strong> · Present this ticket (print or on phone) at the door
          </div>
        </div>

        <div style={{ padding: "8px 28px 20px", fontSize: 11, color: colors.textSecondary, textAlign: "center", borderTop: `1px dashed ${primary}` }}>
          Verification code: <strong style={{ color: colors.textPrimary }}>{ticket.verificationCode}</strong>
          {" · Paid "}
          {ticket.tenderType ? `${ticket.tenderType[0].toUpperCase()}${ticket.tenderType.slice(1)}${ticket.checkNumber ? ` · #${ticket.checkNumber}` : ""} · ` : ""}
          {money(ticket.tenderAmount)}
          {ticket.soldAt && ` · ${formatUtcDate(ticket.soldAt)}`}
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {downloadError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{downloadError}</div>}
        <button style={button.primary} onClick={downloadImage} disabled={downloadBusy}>
          {downloadBusy ? "Preparing…" : "Download as image"}
        </button>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
      <div style={{ fontSize: 13.5, color: colors.textSecondary, fontFamily: "sans-serif" }}>{children}</div>
    </div>
  );
}
