// Print-ready (US Letter) tournament flyer PDF — pdf-lib, same library the
// GC-7Q/Schedule 1/raffle report PDFs already use (see gc7qPdf.js,
// raffleReportsPdf.js), so this adds no new heavyweight dependency (no
// headless-browser HTML-to-PDF renderer needed for a layout this bounded).
//
// The QR code is generated locally via the `qrcode` package — a free,
// offline, MIT-licensed algorithm, not a third-party API. There's nothing to
// sign up for, no per-scan cost, and no vendor to depend on.
//
// The layout mirrors the approved PublicGolf.jsx embed design (checkmark
// "What's Included" chips, a schedule timeline, a dark "Have Questions?"
// contact card) so the printed flyer and the web registration page read as
// one system — see the approved rendering this was built from. pdf-lib has
// no rounded-rect or CSS color-mix primitive, so tinted panels/corners are
// flattened to solid rectangles here; the structure, type pairing, and
// color system carry over faithfully even though a few decorative touches
// (rounded corners, drop shadows) don't have a raw-PDF equivalent.
//
// This only handles the Golf module today (there's no Events module yet),
// but nothing here is golf-specific by construction — buildEventFlyerPdf()
// takes a plain content shape, and buildGolfFlyerPdf() is just the
// GolfTournament -> that shape mapping. A future Events module can call
// buildEventFlyerPdf() directly with its own mapping.
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, LineCapStyle } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const QRCode = require("qrcode");
const { formatPhone } = require("./phone");

const FONT_DIR = path.join(__dirname, "../../templates/fonts");
const FONT_FILES = {
  interRegular: "Inter-Regular.ttf",
  interMedium: "Inter-Medium.ttf",
  interSemiBold: "Inter-SemiBold.ttf",
  interBold: "Inter-Bold.ttf",
  displayBold: "BigShoulders-Bold.ttf",
  displayBlack: "BigShoulders-Black.ttf",
};

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 36; // 0.5in

// Same hex values as client/src/lib/tokens.js's `colors` export — the app's
// one brand palette, not a flyer-specific choice.
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const COLOR = {
  tealDeep: hex("#1a3f47"),
  teal: hex("#25555f"),
  tealTint: hex("#e2ebea"),
  tealTintText: hex("#a9c8c3"),
  terracotta: hex("#cd715c"),
  terracottaDeep: hex("#b35943"),
  terracottaTint: hex("#fbe9e4"),
  cream: hex("#faf8f2"),
  ink: hex("#23302f"),
  inkSoft: hex("#756f63"),
  inkFaint: hex("#a39c8d"),
  line: hex("#ece6d9"),
  white: rgb(1, 1, 1),
};

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

// Formats a stored DateTime as calendar-day parts using UTC getters — this
// app stores tournament dates as a bare calendar day, and reading them back
// with local-timezone getters has bitten this codebase before (a server
// running behind UTC can read the day before/after what was actually
// entered). Matches the UTC-formatting convention already established for
// the FRS report and elsewhere.
function dateParts(d) {
  const date = new Date(d);
  return {
    month: date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
    day: date.getUTCDate(),
    year: date.getUTCFullYear(),
  };
}

// Greedy word-wrap at a given font/size — pdf-lib draws single lines only,
// so anything variable-length (the headline, a long included-item) needs
// this before drawText.
function wrapText(font, size, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(attempt, size) <= maxWidth) {
      current = attempt;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Shrinks through a list of font sizes until the text wraps within maxLines;
// falls back to truncating the last line with an ellipsis at the smallest
// size rather than ever overflowing its box.
function fitWrapped(font, text, maxWidth, sizes, maxLines) {
  for (const size of sizes) {
    const lines = wrapText(font, size, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size, lineHeight: size * 1.05 };
  }
  const size = sizes[sizes.length - 1];
  let lines = wrapText(font, size, text, maxWidth).slice(0, maxLines);
  let last = lines[maxLines - 1] || "";
  while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
  lines[maxLines - 1] = `${last}…`;
  return { lines, size, lineHeight: size * 1.05 };
}

function loadFonts() {
  const bytes = {};
  for (const [key, file] of Object.entries(FONT_FILES)) {
    bytes[key] = fs.readFileSync(path.join(FONT_DIR, file));
  }
  return bytes;
}

// content: {
//   orgName, orgPhone,               // footer
//   eventName,                       // hero headline
//   subLine,                         // e.g. "Four-Person Team Scramble · Red Hook Golf Club"
//   date,                            // Date | ISO string — drives the corner date tab
//   stats: [{ label, value }],       // up to 3, e.g. Format/Cost/Venue
//   includedItems: string[],
//   scheduleItems: [{ time, label }],
//   contactName, contactPhone,
//   registerUrl,                     // absolute URL — encoded into the QR and printed as text
//   registerUrlLabel,                // shortened display text for the URL line
//   fineText,                        // small print under the CTA, e.g. cost/due-date reminder
// }
async function buildEventFlyerPdf(content) {
  const fontBytes = loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset: true isn't just a file-size optimization here — without it,
  // pdf-lib's custom-font text encoding mishandles literal "(", ")" and "-"
  // characters (they're PDF string-syntax metacharacters), producing
  // visibly wrong glyph spacing and corrupted copy-pasted text. Verified via
  // a side-by-side render before landing this.
  const [interRegular, interMedium, interSemiBold, interBold, displayBold, displayBlack] = await Promise.all([
    doc.embedFont(fontBytes.interRegular, { subset: true }),
    doc.embedFont(fontBytes.interMedium, { subset: true }),
    doc.embedFont(fontBytes.interSemiBold, { subset: true }),
    doc.embedFont(fontBytes.interBold, { subset: true }),
    doc.embedFont(fontBytes.displayBold, { subset: true }),
    doc.embedFont(fontBytes.displayBlack, { subset: true }),
  ]);

  const qrPng = await QRCode.toBuffer(content.registerUrl, {
    type: "png",
    errorCorrectionLevel: "Q", // headroom for a scan-worn printed page, not a scratched screen
    margin: 1,
    width: 480,
    color: { dark: "#23302f", light: "#ffffff" },
  });
  const qrImage = await doc.embedPng(qrPng);

  const page = doc.addPage([PAGE.width, PAGE.height]);
  const contentW = PAGE.width - MARGIN * 2;

  // ---- Hero band ----
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: COLOR.cream });

  const orgLabel = (content.orgName || "").toUpperCase();
  const headline = fitWrapped(displayBlack, content.eventName || "", contentW - 110, [40, 34, 30, 26, 22], 2);

  // First pass: walk the same y-cursor math the real draw will use, purely to
  // find where the band ends — pdf-lib has no z-order/layers, so the teal
  // fill has to exist before any text is drawn on top of it, which means the
  // band's height (dependent on how many lines the headline wraps to) must
  // be known before the fill is drawn.
  let hy = PAGE.height - MARGIN - 9 - 22;
  for (const _line of headline.lines) hy -= headline.size * 0.86;
  hy -= 18;
  if (content.subLine) hy -= 14;
  const heroBottom = hy - 30; // breathing room before the date tab overlaps the seam

  page.drawRectangle({ x: 0, y: heroBottom, width: PAGE.width, height: PAGE.height - heroBottom, color: COLOR.tealDeep });

  hy = PAGE.height - MARGIN - 9;
  page.drawCircle({ x: MARGIN + 3, y: hy + 3, size: 3, color: COLOR.terracotta });
  page.drawText(orgLabel, { x: MARGIN + 12, y: hy, size: 10.5, font: interBold, color: COLOR.tealTintText });
  hy -= 22;
  for (const line of headline.lines) {
    hy -= headline.size * 0.86;
    page.drawText(line, { x: MARGIN, y: hy, size: headline.size, font: displayBlack, color: COLOR.white });
  }
  hy -= 18;
  if (content.subLine) {
    page.drawText(content.subLine, { x: MARGIN, y: hy, size: 12.5, font: interMedium, color: hex("#d8e6e3") });
  }

  // ---- Date tab (overlaps the hero/body seam) ----
  const { month, day, year } = dateParts(content.date);
  const tabW = 74, tabH = 74;
  const tabX = PAGE.width - MARGIN - tabW;
  const tabY = heroBottom - tabH / 2;
  page.drawRectangle({ x: tabX, y: tabY, width: tabW, height: tabH, color: COLOR.terracotta });
  page.drawText(month.toUpperCase(), { x: tabX + (tabW - interBold.widthOfTextAtSize(month.toUpperCase(), 9.5)) / 2, y: tabY + tabH - 18, size: 9.5, font: interBold, color: COLOR.white });
  const dayStr = String(day);
  page.drawText(dayStr, { x: tabX + (tabW - displayBlack.widthOfTextAtSize(dayStr, 30)) / 2, y: tabY + 24, size: 30, font: displayBlack, color: COLOR.white });
  page.drawText(String(year), { x: tabX + (tabW - interSemiBold.widthOfTextAtSize(String(year), 9.5)) / 2, y: tabY + 10, size: 9.5, font: interSemiBold, color: COLOR.white });

  // ---- Stat row ----
  let y2 = heroBottom - 26;
  const stats = (content.stats || []).filter((s) => s.value);
  if (stats.length) {
    const rowH = 44;
    const colW = contentW / stats.length;
    page.drawRectangle({ x: MARGIN, y: y2 - rowH, width: contentW, height: rowH, borderWidth: 1, borderColor: COLOR.line, color: COLOR.white });
    stats.forEach((s, i) => {
      const cx = MARGIN + colW * i;
      if (i > 0) page.drawLine({ start: { x: cx, y: y2 - rowH }, end: { x: cx, y: y2 }, thickness: 1, color: COLOR.line });
      page.drawText(s.label.toUpperCase(), { x: cx + 12, y: y2 - 16, size: 8, font: interBold, color: COLOR.inkFaint });
      const valSize = 12.5;
      const fitVal = fitWrapped(interBold, s.value, colW - 24, [valSize], 1).lines[0];
      page.drawText(fitVal, { x: cx + 12, y: y2 - 32, size: valSize, font: interBold, color: COLOR.ink });
    });
    y2 -= rowH + 24;
  } else {
    y2 -= 6;
  }

  // ---- Two-column body: included items (left) / schedule + contact (right) ----
  const ctaBandH = 108;
  const footerH = 34;
  const bodyBottom = footerH + ctaBandH + 20;
  const gap = 22;
  const colW = (contentW - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  if (content.includedItems && content.includedItems.length) {
    let ly = y2;
    ly = drawSectionHeading(page, "What's Included", leftX, ly, colW, interBold);
    ly -= 12;
    const itemColW = (colW - 12) / 2;
    content.includedItems.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const ix = leftX + col * (itemColW + 12);
      const iy = ly - row * 20;
      // A hand-drawn vector check, not the ✓ glyph — several of this flyer's
      // fonts don't carry that character in their subset, and a check that
      // silently disappears is worse than one drawn with two line segments.
      const cx = ix + 8, cy = iy + 3;
      page.drawCircle({ x: cx, y: cy, size: 8, color: COLOR.tealTint });
      page.drawLine({ start: { x: cx - 4, y: cy - 0.5 }, end: { x: cx - 1, y: cy - 3.5 }, thickness: 1.4, color: COLOR.tealDeep, lineCap: LineCapStyle.Round });
      page.drawLine({ start: { x: cx - 1, y: cy - 3.5 }, end: { x: cx + 4.5, y: cy + 3.5 }, thickness: 1.4, color: COLOR.tealDeep, lineCap: LineCapStyle.Round });
      const fit = fitWrapped(interSemiBold, item, itemColW - 22, [10.5], 1).lines[0];
      page.drawText(fit, { x: ix + 20, y: iy, size: 10.5, font: interSemiBold, color: COLOR.ink });
    });
  }

  let ry = y2;
  if (content.scheduleItems && content.scheduleItems.length) {
    ry = drawSectionHeading(page, "Schedule", rightX, ry, colW, interBold);
    ry -= 10;
    for (const item of content.scheduleItems) {
      page.drawText(item.time || "", { x: rightX, y: ry, size: 11.5, font: displayBold, color: COLOR.terracottaDeep });
      const label = fitWrapped(interMedium, item.label || "", colW - 78, [10.5], 1).lines[0];
      page.drawText(label, { x: rightX + 68, y: ry + 1, size: 10.5, font: interMedium, color: COLOR.ink });
      ry -= 17;
      page.drawLine({ start: { x: rightX, y: ry + 6 }, end: { x: rightX + colW, y: ry + 6 }, thickness: 0.5, color: COLOR.line });
      ry -= 4;
    }
  }

  if (content.contactName || content.contactPhone) {
    const cardH = 68;
    const cardY = bodyBottom; // pinned to the bottom of the body area, same as the web card's margin-top:auto
    page.drawRectangle({ x: rightX, y: cardY, width: colW, height: cardH, color: COLOR.tealDeep });
    page.drawText("HAVE QUESTIONS?", { x: rightX + 14, y: cardY + cardH - 20, size: 9, font: interBold, color: COLOR.tealTintText });
    let cy = cardY + cardH - 38;
    if (content.contactName) {
      page.drawText(content.contactName, { x: rightX + 14, y: cy, size: 11.5, font: interSemiBold, color: COLOR.white });
      cy -= 16;
    }
    if (content.contactPhone) {
      page.drawText(formatPhone(content.contactPhone), { x: rightX + 14, y: cy, size: 11.5, font: interSemiBold, color: COLOR.white });
    }
  }

  // ---- CTA band ----
  const ctaY = footerH;
  page.drawRectangle({ x: 0, y: ctaY, width: PAGE.width, height: ctaBandH, color: COLOR.terracotta });
  const qrSize = 76;
  const qrPad = 8;
  page.drawRectangle({ x: MARGIN, y: ctaY + (ctaBandH - qrSize - qrPad * 2) / 2, width: qrSize + qrPad * 2, height: qrSize + qrPad * 2, color: COLOR.white });
  page.drawImage(qrImage, { x: MARGIN + qrPad, y: ctaY + (ctaBandH - qrSize) / 2, width: qrSize, height: qrSize });

  const copyX = MARGIN + qrSize + qrPad * 2 + 22;
  let cty = ctaY + ctaBandH - 24;
  page.drawText("REGISTER YOUR TEAM", { x: copyX, y: cty, size: 10, font: interBold, color: hex("#ffe1d9") });
  cty -= 26;
  page.drawText("SCAN TO SIGN UP", { x: copyX, y: cty, size: 24, font: displayBlack, color: COLOR.white });
  cty -= 20;
  if (content.registerUrlLabel) {
    page.drawText(content.registerUrlLabel, { x: copyX, y: cty, size: 11, font: interSemiBold, color: COLOR.white });
    cty -= 14;
  }
  if (content.fineText) {
    page.drawText(content.fineText, { x: copyX, y: cty, size: 8.5, font: interMedium, color: hex("#ffe1d9") });
  }

  // ---- Footer ----
  page.drawLine({ start: { x: MARGIN, y: footerH }, end: { x: PAGE.width - MARGIN, y: footerH }, thickness: 1, color: COLOR.line });
  page.drawText(content.orgName || "", { x: MARGIN, y: 12, size: 9, font: interBold, color: COLOR.inkSoft });
  if (content.orgPhone) {
    const phoneText = formatPhone(content.orgPhone);
    const w = interRegular.widthOfTextAtSize(phoneText, 9);
    page.drawText(phoneText, { x: PAGE.width - MARGIN - w, y: 12, size: 9, font: interRegular, color: COLOR.inkFaint });
  }

  return doc.save();
}

function drawSectionHeading(page, text, x, y, width, font) {
  page.drawText(text.toUpperCase(), { x, y, size: 11, font, color: rgb(0.145, 0.333, 0.373) });
  return y;
}

// GolfTournament -> the generic content shape above.
async function buildGolfFlyerPdf({ org, tournament, registerUrl }) {
  const stats = [
    tournament.format && { label: "Format", value: tournament.format },
    tournament.costPerPlayer != null && { label: "Cost", value: `${money(tournament.costPerPlayer)} / player` },
    tournament.venueName && { label: "Venue", value: tournament.venueName },
  ].filter(Boolean);

  const subParts = [tournament.format, tournament.venueName].filter(Boolean);

  let registerUrlLabel;
  try {
    const u = new URL(registerUrl);
    registerUrlLabel = `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    registerUrlLabel = registerUrl;
  }

  const fineParts = [];
  if (tournament.costPerPlayer != null) fineParts.push(`Teams pay ${money(tournament.costPerPlayer)}/player`);
  if (tournament.contactPhone) fineParts.push(`Or call ${formatPhone(tournament.contactPhone)}`);

  return buildEventFlyerPdf({
    orgName: org.name,
    orgPhone: tournament.contactPhone, // no distinct org-level phone field yet — the tournament's own public contact number is reused here, same one shown in the contact card
    eventName: tournament.name,
    subLine: subParts.join(" · "),
    date: tournament.date,
    stats,
    includedItems: tournament.includedItems || [],
    scheduleItems: tournament.scheduleItems || [],
    contactName: tournament.contactName,
    contactPhone: tournament.contactPhone,
    registerUrl,
    registerUrlLabel,
    fineText: fineParts.join("  ·  "),
  });
}

module.exports = { buildEventFlyerPdf, buildGolfFlyerPdf };
