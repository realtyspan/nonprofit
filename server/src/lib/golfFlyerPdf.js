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
const { decodeDataUrl } = require("./dataUrl");

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

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Neutrals never change per-org — same hex values as client/src/lib/tokens.js's
// `colors` export. Only the two brand colors below (primary/accent) are ever
// customized (see deriveFlyerTheme).
const NEUTRAL = {
  cream: hex("#faf8f2"),
  ink: hex("#23302f"),
  inkSoft: hex("#756f63"),
  inkFaint: hex("#a39c8d"),
  line: hex("#ece6d9"),
  white: rgb(1, 1, 1),
};

const DEFAULT_PRIMARY = "#25555f"; // app's default teal accent
const DEFAULT_ACCENT = "#cd715c"; // app's default terracotta focus color

// --- hex <-> HSL, so an org's one arbitrary hex color can be turned into a
// full set of flyer-ready shades (a light tint, a guaranteed-dark panel
// fill, etc.) without ever asking them to pick more than two colors, and
// without the result depending on how light or dark their original pick
// happened to be. Plain-JS since pdf-lib has no CSS color-mix equivalent.
function hexToRgbTuple(h) {
  const clean = h.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgbTuple([h, s, l]) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
}
// Same hue/saturation, a specific lightness — the tool every derived shade
// below is built from.
function withLightness(hexColor, l, satMultiplier = 1) {
  const [h, s] = rgbToHsl(hexToRgbTuple(hexColor));
  const [r, g, b] = hslToRgbTuple([h, Math.min(s * satMultiplier, 1), l]);
  return rgb(r / 255, g / 255, b / 255);
}
// Turns the org's two chosen colors (or the app defaults, if they haven't
// set any) into every shade the flyer actually draws with. `primary` covers
// solid dark panels (hero band, contact card) and dark text on the cream
// page background; `accent` covers the one eye-catching element (date tab,
// register CTA band). Lightness is force-clamped in both directions so an
// org's pick — however pale or however dark — always still reads clearly
// against white or black text; nothing here can produce an unreadable flyer.
function deriveFlyerTheme(primaryHex, accentHex) {
  const primary = primaryHex || DEFAULT_PRIMARY;
  const accent = accentHex || DEFAULT_ACCENT;

  const [ah, as] = rgbToHsl(hexToRgbTuple(accent));
  const accentL = Math.min(Math.max(rgbToHsl(hexToRgbTuple(accent))[2], 0.38), 0.55);
  const accentRgb = rgb(...hslToRgbTuple([ah, as, accentL]).map((v) => v / 255));
  const accentDeepRgb = rgb(...hslToRgbTuple([ah, as, Math.max(accentL - 0.15, 0.28)]).map((v) => v / 255));

  return {
    primaryDeep: withLightness(primary, 0.22), // panel fills + heading text on cream — dark enough for white text on top, dark enough to read on cream
    primaryTint: withLightness(primary, 0.9, 0.75), // light badge-circle background
    primaryTintText: withLightness(primary, 0.78, 0.35), // muted caption label on a primary-colored panel (e.g. "HAVE QUESTIONS?")
    accent: accentRgb, // tab + CTA band fills — needs to stay dark enough for white text
    accentDeep: accentDeepRgb, // text color on cream (e.g. schedule times) — always meaningfully darker than the accent fill above
    accentTintText: withLightness(accent, 0.86, 0.35), // muted caption text sitting on the accent-colored CTA band (e.g. "REGISTER YOUR TEAM")
  };
}

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

// Formats a stored DateTime as calendar-day parts in `timeZone` (default
// UTC). Golf/Tournament dates are stored as a bare calendar day (midnight
// UTC) and MUST be read as UTC — reading them with local-timezone getters
// has bitten this codebase before (a server behind UTC reads the day
// before/after what was entered). An Event date, though, is a real instant
// (its start time), so the event flyer passes the org's zone to get the
// calendar day the org actually means.
function dateParts(d, timeZone = "UTC") {
  const date = new Date(d);
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { month: get("month"), day: Number(get("day")), year: Number(get("year")) };
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

// A data-URL image -> an embedded pdf-lib image, or null. jpeg vs png is
// read off the data-URL mime; a decode failure returns null so the flyer
// falls back to its no-photo layout rather than erroring.
async function embedFlyerImage(doc, dataUrl) {
  if (!dataUrl) return null;
  const bytes = decodeDataUrl(dataUrl);
  if (!bytes) return null;
  const isPng = /^data:image\/png/i.test(dataUrl);
  try {
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    try { return isPng ? await doc.embedJpg(bytes) : await doc.embedPng(bytes); } catch { return null; }
  }
}

// content: {
//   orgName, orgPhone,               // footer
//   primaryColor, accentColor,       // org's two brand hex colors, or null for the app defaults — see deriveFlyerTheme
//   eventName,                       // hero headline
//   subLine,                         // tagline / one-liner under the headline
//   heroImage, secondaryImage,       // optional base64 data URLs — hero fills the top band; secondary is an inset beside the description
//   date,                            // Date | ISO string — drives the corner date tab
//   dateTimeZone,                    // optional IANA zone the date tab's day is read in (default UTC — for a bare calendar day; events pass their org zone since their date is a real instant)
//   statusNote,                      // optional — highlighted bar under the stat row
//   stats: [{ label, value }],       // up to 3, e.g. Time/Location/Price
//   description,                     // optional prose block
//   includedItems: string[],
//   includedItemsHeading,             // optional — defaults to "What's Included"
//   ctaEyebrow, ctaHeadline,          // optional — default to golf's "REGISTER YOUR TEAM" / "SCAN TO SIGN UP"
//   scheduleItems: [{ time, label }],
//   contactName, contactPhone, contactEmail,
//   contactHeading,                  // optional — defaults to "HAVE QUESTIONS?"
//   registerUrl, registerUrlLabel,   // QR destination + its shortened printed label
//   payUrl,                          // optional — adds a "Pay online" line to the fine print
//   fineText,                        // small print under the CTA
// }
//
// Body layout is adaptive: About / (Included + Schedule) / Contact each
// render only when they have content and take only the height they need,
// stacked top-down between the stat row and the CTA band. When the stack
// would overflow, it sheds in order: secondary photo, then schedule/
// included rows capped, then the description truncated.
async function buildEventFlyerPdf(content) {
  const theme = deriveFlyerTheme(content.primaryColor, content.accentColor);
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

  const heroImg = await embedFlyerImage(doc, content.heroImage);

  // ---- Hero band ----
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: NEUTRAL.cream });

  const orgLabel = (content.orgName || "").toUpperCase();
  const headline = fitWrapped(displayBlack, content.eventName || "", contentW - 110, [40, 34, 30, 26, 22], 2);
  // How far apart wrapped headline lines sit, as a multiple of the font size.
  const HEADLINE_LINE_HEIGHT = 1.0;

  let heroBottom;
  if (heroImg) {
    // Photo hero: fixed-height band, image scaled to cover and centre-cropped.
    // pdf-lib has no clip path, so vertical overflow is masked by re-painting
    // the cream page below the band; horizontal overflow just clips at the
    // page edge.
    const HERO_H = 238;
    heroBottom = PAGE.height - HERO_H;
    const s = Math.max(PAGE.width / heroImg.width, HERO_H / heroImg.height);
    const dw = heroImg.width * s;
    const dh = heroImg.height * s;
    page.drawImage(heroImg, { x: (PAGE.width - dw) / 2, y: heroBottom - (dh - HERO_H) / 2, width: dw, height: dh });
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: heroBottom, color: NEUTRAL.cream });
    // Darkening scrim toward the bottom, where the overlaid text sits —
    // pdf-lib has no gradient. Each band runs from its own top edge all the
    // way down to the hero's bottom, so the bands NEST rather than tile:
    // opacity accumulates into a smooth ramp (~0.72 at the bottom edge,
    // fading to clear ~200pt up) with no internal seams — only each band's
    // single faint top edge shows. Band tops are spaced on a curve so the
    // darkening eases in.
    const SCRIM_H = 200;
    const BANDS = 48;
    for (let i = 0; i < BANDS; i++) {
      const h = Math.round(SCRIM_H * (((i + 1) / BANDS) ** 1.7));
      page.drawRectangle({
        x: 0, y: heroBottom,
        width: PAGE.width, height: h,
        color: rgb(0.04, 0.05, 0.05), opacity: 0.026,
      });
    }
    let ty = heroBottom + 20;
    if (content.subLine) {
      const sub = fitWrapped(interMedium, content.subLine, contentW, [12.5], 1).lines[0];
      page.drawText(sub, { x: MARGIN, y: ty, size: 12.5, font: interMedium, color: NEUTRAL.white, opacity: 0.92 });
      ty += 22;
    }
    for (let i = headline.lines.length - 1; i >= 0; i--) {
      page.drawText(headline.lines[i], { x: MARGIN, y: ty, size: headline.size, font: displayBlack, color: NEUTRAL.white });
      ty += headline.size * HEADLINE_LINE_HEIGHT;
    }
    ty += 4;
    page.drawCircle({ x: MARGIN + 3, y: ty + 3, size: 3, color: theme.accent });
    page.drawText(orgLabel, { x: MARGIN + 12, y: ty, size: 10.5, font: interBold, color: NEUTRAL.white, opacity: 0.82 });
  } else {
    // Solid-colour hero band — height follows the headline's line count, so
    // the fill has to be sized before any text is drawn on top of it.
    let hy = PAGE.height - MARGIN - 9 - 22;
    for (const _line of headline.lines) hy -= headline.size * HEADLINE_LINE_HEIGHT;
    hy -= 18;
    if (content.subLine) hy -= 14;
    heroBottom = hy - 30; // breathing room before the date tab overlaps the seam

    page.drawRectangle({ x: 0, y: heroBottom, width: PAGE.width, height: PAGE.height - heroBottom, color: theme.primaryDeep });

    hy = PAGE.height - MARGIN - 9;
    page.drawCircle({ x: MARGIN + 3, y: hy + 3, size: 3, color: theme.accent });
    page.drawText(orgLabel, { x: MARGIN + 12, y: hy, size: 10.5, font: interBold, color: theme.primaryTintText });
    hy -= 22;
    for (const line of headline.lines) {
      hy -= headline.size * HEADLINE_LINE_HEIGHT;
      page.drawText(line, { x: MARGIN, y: hy, size: headline.size, font: displayBlack, color: NEUTRAL.white });
    }
    hy -= 18;
    if (content.subLine) {
      page.drawText(content.subLine, { x: MARGIN, y: hy, size: 12.5, font: interMedium, color: theme.primaryTintText });
    }
  }

  // ---- Date tab (overlaps the hero/body seam) ----
  const { month, day, year } = dateParts(content.date, content.dateTimeZone);
  const tabW = 74, tabH = 74;
  const tabX = PAGE.width - MARGIN - tabW;
  const tabY = heroBottom - tabH / 2;
  page.drawRectangle({ x: tabX, y: tabY, width: tabW, height: tabH, color: theme.accent });
  page.drawText(month.toUpperCase(), { x: tabX + (tabW - interBold.widthOfTextAtSize(month.toUpperCase(), 9.5)) / 2, y: tabY + tabH - 18, size: 9.5, font: interBold, color: NEUTRAL.white });
  const dayStr = String(day);
  page.drawText(dayStr, { x: tabX + (tabW - displayBlack.widthOfTextAtSize(dayStr, 30)) / 2, y: tabY + 24, size: 30, font: displayBlack, color: NEUTRAL.white });
  page.drawText(String(year), { x: tabX + (tabW - interSemiBold.widthOfTextAtSize(String(year), 9.5)) / 2, y: tabY + 10, size: 9.5, font: interSemiBold, color: NEUTRAL.white });

  // ---- Stat row ----
  // Must clear the date tab's bottom edge (tabY), not just heroBottom — the
  // tab intentionally overlaps the hero/body seam, and a fixed heroBottom-26
  // offset here left only an 11pt gap to the tab's actual bottom (37pt below
  // the seam), so the stat row's white box was silently painting over the
  // last few points of the tab (including the year label) on every flyer.
  let y2 = tabY - 14;
  const stats = (content.stats || []).filter((s) => s.value);
  if (stats.length) {
    const rowH = 44;
    const colW = contentW / stats.length;
    page.drawRectangle({ x: MARGIN, y: y2 - rowH, width: contentW, height: rowH, borderWidth: 1, borderColor: NEUTRAL.line, color: NEUTRAL.white });
    stats.forEach((s, i) => {
      const cx = MARGIN + colW * i;
      if (i > 0) page.drawLine({ start: { x: cx, y: y2 - rowH }, end: { x: cx, y: y2 }, thickness: 1, color: NEUTRAL.line });
      page.drawText(s.label.toUpperCase(), { x: cx + 12, y: y2 - 16, size: 8, font: interBold, color: NEUTRAL.inkFaint });
      const valSize = 12.5;
      const fitVal = fitWrapped(interBold, s.value, colW - 24, [valSize], 1).lines[0];
      page.drawText(fitVal, { x: cx + 12, y: y2 - 32, size: valSize, font: interBold, color: NEUTRAL.ink });
    });
    y2 -= rowH + 16;
  } else {
    y2 -= 6;
  }

  // ---- Status-note bar (mirrors the web page's .evt-notice) ----
  if (content.statusNote) {
    const noteLines = wrapText(interSemiBold, 10, content.statusNote, contentW - 32);
    const barH = 16 + noteLines.length * 13;
    page.drawRectangle({ x: MARGIN, y: y2 - barH, width: contentW, height: barH, color: theme.primaryTint });
    noteLines.forEach((ln, i) => {
      page.drawText(ln, { x: MARGIN + 16, y: y2 - 17 - i * 13, size: 10, font: interSemiBold, color: theme.primaryDeep });
    });
    y2 -= barH + 14;
  }

  // ---- Adaptive body ----
  // A top-down flow of blocks (About / Included + Schedule / Contact), each
  // drawn only when it has content and taking only the height it needs,
  // stacked between the stat row and the CTA band. pdf-lib can't paginate,
  // so a pre-flight measures the whole stack and, while it overflows, sheds
  // progressively: drop the secondary photo, truncate the description, cap
  // the list rows, step the base font size down, and finally drop the
  // description block entirely. The last attempt is small enough to always
  // fit. The contact card is pinned toward the bottom of the body area
  // (the web page's margin-top:auto) so a short flyer doesn't leave a gap
  // above it.
  const ctaBandH = 108;
  const footerH = 34;
  const bodyBottomY = footerH + ctaBandH + 20;

  const secondaryImg = await embedFlyerImage(doc, content.secondaryImage);
  const hasAbout = !!(content.description && content.description.trim());
  const includedItems = (content.includedItems || []).filter(Boolean);
  const scheduleItems = (content.scheduleItems || []).filter((s) => s && (s.label || s.time));
  const hasContact = !!(content.contactName || content.contactPhone || content.contactEmail);
  const avail = y2 - bodyBottomY;

  function ellipsize(font, text, size, maxWidth) {
    let s = text;
    while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxWidth) s = s.slice(0, -1);
    return s + "…";
  }

  function planBody({ keepSecondary, descMaxLines, listCap, small }) {
    const bs = small ? 9.5 : 10.5;
    const lh = bs * 1.34;
    const headingH = small ? 24 : 28;
    const incRowH = small ? 17 : 20;
    const schRowH = small ? 18 : 21;
    const gap = small ? 14 : 18;
    const contactH = small ? 54 : 60;
    const blocks = [];

    if (hasAbout && descMaxLines > 0) {
      const withImg = keepSecondary && !!secondaryImg;
      const textW = withImg ? Math.round(contentW * 0.56) : contentW;
      let lines = wrapText(interRegular, bs, content.description.trim(), textW);
      if (lines.length > descMaxLines) {
        lines = lines.slice(0, descMaxLines);
        lines[lines.length - 1] = ellipsize(interRegular, lines[lines.length - 1], bs, textW);
      }
      const textH = lines.length * lh;
      let imgW = 0, imgH = 0;
      if (withImg) {
        imgW = Math.round(contentW * 0.4);
        imgH = Math.min(Math.round(imgW * (secondaryImg.height / secondaryImg.width)), Math.max(textH, 96), 150);
      }
      blocks.push({ type: "about", h: headingH + Math.max(textH, imgH), lines, bs, lh, headingH, withImg, imgW, imgH });
    }

    const inc = includedItems.slice(0, listCap);
    const sch = scheduleItems.slice(0, listCap);
    const incMore = includedItems.length - inc.length;
    const schMore = scheduleItems.length - sch.length;
    if (inc.length || sch.length) {
      const bothCols = inc.length > 0 && sch.length > 0;
      const cw = bothCols ? Math.round((contentW - 22) / 2) : contentW;
      const incH = inc.length ? headingH + inc.length * incRowH + (incMore > 0 ? 15 : 0) : 0;
      const schH = sch.length ? headingH + sch.length * schRowH + (schMore > 0 ? 15 : 0) : 0;
      blocks.push({ type: "lists", h: Math.max(incH, schH), inc, sch, incMore, schMore, bothCols, cw, bs, headingH, incRowH, schRowH });
    }

    if (hasContact) blocks.push({ type: "contact", h: contactH });

    const total = blocks.reduce((s, b) => s + b.h, 0) + Math.max(0, blocks.length - 1) * gap;
    return { blocks, total, gap };
  }

  const attempts = [
    { keepSecondary: true, descMaxLines: 10, listCap: 99, small: false },
    { keepSecondary: false, descMaxLines: 10, listCap: 99, small: false },
    { keepSecondary: false, descMaxLines: 7, listCap: 10, small: false },
    { keepSecondary: false, descMaxLines: 5, listCap: 8, small: true },
    { keepSecondary: false, descMaxLines: 4, listCap: 6, small: true },
    { keepSecondary: false, descMaxLines: 3, listCap: 5, small: true },
    { keepSecondary: false, descMaxLines: 2, listCap: 4, small: true },
    { keepSecondary: false, descMaxLines: 2, listCap: 3, small: true },
    { keepSecondary: false, descMaxLines: 0, listCap: 4, small: true },
    { keepSecondary: false, descMaxLines: 0, listCap: 3, small: true },
  ];
  // A small tolerance: every block height is measured with generous leading
  // (line height 1.34, a 24-28pt heading slug over ~11pt glyphs), so a stack
  // a few points "over" still prints inside its bounds — and the contact
  // card is pinned to the bottom, giving real slack besides.
  let plan = planBody(attempts[0]);
  for (const a of attempts) {
    plan = planBody(a);
    if (plan.total <= avail + 12) break;
  }

  function drawAbout(b, top) {
    drawSectionHeading(page, "About This Event", MARGIN, top - 8, interBold, theme.primaryDeep);
    const startY = top - b.headingH;
    b.lines.forEach((ln, i) => {
      page.drawText(ln, { x: MARGIN, y: startY - b.bs - i * b.lh, size: b.bs, font: interRegular, color: NEUTRAL.inkSoft });
    });
    if (b.withImg) {
      page.drawImage(secondaryImg, { x: MARGIN + contentW - b.imgW, y: startY - b.imgH, width: b.imgW, height: b.imgH });
    }
  }

  function drawLists(b, top) {
    const incX = MARGIN;
    const schX = b.bothCols ? MARGIN + b.cw + 22 : MARGIN;
    if (b.inc.length) {
      drawSectionHeading(page, content.includedItemsHeading || "What's Included", incX, top - 8, interBold, theme.primaryDeep);
      const ly = top - b.headingH;
      b.inc.forEach((item, i) => {
        const iy = ly - i * b.incRowH;
        const cx = incX + 8, cy = iy + 3;
        // Hand-drawn vector check — the subset fonts don't carry the ✓ glyph.
        page.drawCircle({ x: cx, y: cy, size: 8, color: theme.primaryTint });
        page.drawLine({ start: { x: cx - 4, y: cy - 0.5 }, end: { x: cx - 1, y: cy - 3.5 }, thickness: 1.4, color: theme.primaryDeep, lineCap: LineCapStyle.Round });
        page.drawLine({ start: { x: cx - 1, y: cy - 3.5 }, end: { x: cx + 4.5, y: cy + 3.5 }, thickness: 1.4, color: theme.primaryDeep, lineCap: LineCapStyle.Round });
        const fit = fitWrapped(interSemiBold, item, b.cw - 30, [b.bs], 1).lines[0];
        page.drawText(fit, { x: incX + 20, y: iy, size: b.bs, font: interSemiBold, color: NEUTRAL.ink });
      });
      if (b.incMore > 0) {
        page.drawText(`+${b.incMore} more`, { x: incX + 20, y: ly - b.inc.length * b.incRowH, size: 9, font: interMedium, color: NEUTRAL.inkFaint });
      }
    }
    if (b.sch.length) {
      drawSectionHeading(page, "Schedule", schX, top - 8, interBold, theme.primaryDeep);
      let ry = top - b.headingH;
      for (const item of b.sch) {
        page.drawText(item.time || "", { x: schX, y: ry, size: 11.5, font: displayBold, color: theme.accentDeep });
        const label = fitWrapped(interMedium, item.label || "", b.cw - 78, [b.bs], 1).lines[0];
        page.drawText(label, { x: schX + 68, y: ry + 1, size: b.bs, font: interMedium, color: NEUTRAL.ink });
        ry -= b.schRowH - 4;
        page.drawLine({ start: { x: schX, y: ry + 6 }, end: { x: schX + b.cw, y: ry + 6 }, thickness: 0.5, color: NEUTRAL.line });
        ry -= 4;
      }
      if (b.schMore > 0) {
        page.drawText(`+${b.schMore} more`, { x: schX, y: ry, size: 9, font: interMedium, color: NEUTRAL.inkFaint });
      }
    }
  }

  function drawContact(b, top) {
    const cardH = b.h;
    const cardY = top - cardH;
    page.drawRectangle({ x: MARGIN, y: cardY, width: contentW, height: cardH, color: theme.primaryDeep });
    page.drawText(content.contactHeading || "HAVE QUESTIONS?", { x: MARGIN + 16, y: cardY + cardH - 20, size: 9, font: interBold, color: theme.primaryTintText });
    const parts = [];
    if (content.contactName) parts.push(content.contactName);
    if (content.contactPhone) parts.push(formatPhone(content.contactPhone));
    if (content.contactEmail) parts.push(content.contactEmail);
    const line = fitWrapped(interSemiBold, parts.join("   ·   "), contentW - 32, [12, 11, 10], 1).lines[0];
    page.drawText(line, { x: MARGIN + 16, y: cardY + 15, size: 12, font: interSemiBold, color: NEUTRAL.white });
  }

  let by = y2;
  for (const b of plan.blocks) {
    if (b.type === "about") { drawAbout(b, by); by -= b.h + plan.gap; }
    else if (b.type === "lists") { drawLists(b, by); by -= b.h + plan.gap; }
    else if (b.type === "contact") {
      // Contact is always the last block: sit it just above the CTA band
      // (bottom edge at bodyBottomY, a 20pt gap) so a short flyer doesn't
      // leave a gap above the card — the web page's margin-top:auto. Only if
      // the flow ran long does it move up to follow the content.
      drawContact(b, Math.min(by, bodyBottomY + b.h));
    }
  }

  // ---- CTA band ----
  const ctaY = footerH;
  page.drawRectangle({ x: 0, y: ctaY, width: PAGE.width, height: ctaBandH, color: theme.accent });
  const qrSize = 76;
  const qrPad = 8;
  page.drawRectangle({ x: MARGIN, y: ctaY + (ctaBandH - qrSize - qrPad * 2) / 2, width: qrSize + qrPad * 2, height: qrSize + qrPad * 2, color: NEUTRAL.white });
  page.drawImage(qrImage, { x: MARGIN + qrPad, y: ctaY + (ctaBandH - qrSize) / 2, width: qrSize, height: qrSize });

  const copyX = MARGIN + qrSize + qrPad * 2 + 22;
  let cty = ctaY + ctaBandH - 24;
  page.drawText(content.ctaEyebrow || "REGISTER YOUR TEAM", { x: copyX, y: cty, size: 10, font: interBold, color: theme.accentTintText });
  cty -= 26;
  page.drawText(content.ctaHeadline || "SCAN TO SIGN UP", { x: copyX, y: cty, size: 24, font: displayBlack, color: NEUTRAL.white });
  cty -= 20;
  if (content.registerUrlLabel) {
    page.drawText(content.registerUrlLabel, { x: copyX, y: cty, size: 11, font: interSemiBold, color: NEUTRAL.white });
    cty -= 14;
  }
  let fineText = content.fineText || "";
  if (content.payUrl) {
    try {
      const payHost = new URL(content.payUrl).host.replace(/^www\./, "");
      fineText = fineText ? `${fineText}   ·   Pay online at ${payHost}` : `Pay online at ${payHost}`;
    } catch { /* malformed payUrl — skip the line */ }
  }
  if (fineText) {
    const fitFine = fitWrapped(interMedium, fineText, PAGE.width - copyX - MARGIN, [8.5], 1).lines[0];
    page.drawText(fitFine, { x: copyX, y: cty, size: 8.5, font: interMedium, color: theme.accentTintText });
  }

  // ---- Footer ----
  page.drawLine({ start: { x: MARGIN, y: footerH }, end: { x: PAGE.width - MARGIN, y: footerH }, thickness: 1, color: NEUTRAL.line });
  page.drawText(content.orgName || "", { x: MARGIN, y: 12, size: 9, font: interBold, color: NEUTRAL.inkSoft });
  if (content.orgPhone) {
    const phoneText = formatPhone(content.orgPhone);
    const w = interRegular.widthOfTextAtSize(phoneText, 9);
    page.drawText(phoneText, { x: PAGE.width - MARGIN - w, y: 12, size: 9, font: interRegular, color: NEUTRAL.inkFaint });
  }

  return doc.save();
}

function drawSectionHeading(page, text, x, y, font, color) {
  page.drawText(text.toUpperCase(), { x, y, size: 11, font, color });
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
    orgPhone: org.phone || tournament.contactPhone, // prefer the org's own number; fall back to the tournament's contact if the org hasn't set one yet
    primaryColor: org.flyerPrimaryColor,
    accentColor: org.flyerAccentColor,
    eventName: tournament.name,
    subLine: subParts.join(" · "),
    heroImage: tournament.flyerImage || null,
    date: tournament.date,
    stats,
    includedItems: tournament.includedItems || [],
    scheduleItems: tournament.scheduleItems || [],
    contactName: tournament.contactName,
    contactPhone: tournament.contactPhone,
    contactEmail: tournament.contactEmail,
    registerUrl,
    registerUrlLabel,
    fineText: fineParts.join("  ·  "),
  });
}

module.exports = { buildEventFlyerPdf, buildGolfFlyerPdf };
