// Printable snapshot of the Bell Jar Sales Worksheet's "Recent Entries"
// table — same pdf-lib tabular-report approach as raffleReportsPdf.js
// (repeating column header, page-break handling, a totals row), built
// fresh here rather than imported since that file doesn't export its
// generic builder. Exists specifically for members who'll never look at
// a screen: whatever game/date-range filter is showing on screen becomes
// exactly what prints, so the paper copy always matches what was reviewed
// on screen before printing it.
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 40;
const ROW_HEIGHT = 16;
const CELL_PAD = 8;
const HEADER_RULE_COLOR = rgb(0.13, 0.23, 0.5);

function money(n) {
  const v = Number(n) || 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

function fmtGenerated(d) {
  return new Date(d).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
}

function fmtFilterDate(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { dateStyle: "medium" });
}

// Backdated entries are stored as UTC midnight with no real time-of-day —
// print just the date for those instead of a misleading local midnight,
// same heuristic Worksheet.jsx uses on screen.
function fmtEntryDate(dateVal) {
  const d = new Date(dateVal);
  const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return isDateOnly
    ? d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
    : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function truncateToWidth(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

// Widths sized to the actual rendered header-label widths (HelveticaBold at
// 8pt) plus CELL_PAD, not guessed — CASH COLLECTED and PROFIT / LOSS are the
// widest labels and previously had the narrowest columns, which ran their
// headers together with no visible gap.
const COLUMNS = [
  { key: "date", label: "DATE", width: 95 },
  { key: "game", label: "GAME", width: 123 },
  { key: "ticketsSold", label: "TICKETS SOLD", width: 70, align: "right" },
  { key: "cashPaid", label: "CASH PAID", width: 62, align: "right" },
  { key: "cashCollected", label: "CASH COLLECTED", width: 90, align: "right" },
  { key: "profitLoss", label: "PROFIT / LOSS", width: 92, align: "right" },
];

async function buildDailySalesReportPdf({ org, gameLabel, from, to, sales }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page;
  let y;

  function drawHeaderRow() {
    page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: PAGE.width - MARGIN, y: y + 10 }, thickness: 1, color: HEADER_RULE_COLOR });
    let x = MARGIN;
    for (const col of COLUMNS) {
      // Truncated the same as any data cell — a safety net against a column
      // header ever running into its neighbor, not just relying on COLUMNS'
      // widths being sized correctly by hand.
      const label = truncateToWidth(col.label, bold, 8, col.width - CELL_PAD);
      const w = bold.widthOfTextAtSize(label, 8);
      const drawX = col.align === "right" ? x + col.width - CELL_PAD - w : x;
      page.drawText(label, { x: drawX, y, size: 8, font: bold, color: rgb(0.25, 0.25, 0.32) });
      x += col.width;
    }
    y -= 13;
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE.width - MARGIN, y: y + 4 }, thickness: 0.5, color: rgb(0.82, 0.82, 0.82) });
    y -= 12;
  }

  function newPage(withTitle) {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    if (withTitle) {
      page.drawText("Bell Jar Sales Worksheet", { x: MARGIN, y, size: 18, font: bold });
      y -= 22;
      page.drawText(`${org.name} · Recent Entries Report`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
      const rangeLabel = from && to ? `${fmtFilterDate(from)} – ${fmtFilterDate(to)}` : "All dates";
      page.drawText(`Game: ${gameLabel}   ·   Date range: ${rangeLabel}`, { x: MARGIN, y, size: 9.5, font, color: rgb(0.3, 0.3, 0.35) });
      y -= 14;
      page.drawText(`Generated ${fmtGenerated(new Date())}`, { x: MARGIN, y, size: 9, font, color: rgb(0.55, 0.55, 0.55) });
      y -= 18;
    }
    drawHeaderRow();
  }

  newPage(true);

  const rows = sales.map((s) => ({
    date: fmtEntryDate(s.date),
    game: s.dealName,
    ticketsSold: String(s.ticketsSold),
    cashPaid: money(s.cashPaid),
    cashCollected: money(s.cashCollected),
    profitLoss: money(s.profitLoss),
  }));

  for (const row of rows) {
    if (y < MARGIN + 30) newPage(false);
    let x = MARGIN;
    for (const col of COLUMNS) {
      const raw = row[col.key] ?? "";
      const val = truncateToWidth(raw, font, 8.5, col.width - CELL_PAD);
      const w = font.widthOfTextAtSize(val, 8.5);
      const drawX = col.align === "right" ? x + col.width - CELL_PAD - w : x;
      page.drawText(val, { x: drawX, y, size: 8.5, font, color: rgb(0.12, 0.12, 0.14) });
      x += col.width;
    }
    y -= ROW_HEIGHT;
  }

  const totals = sales.reduce(
    (acc, s) => ({
      ticketsSold: acc.ticketsSold + s.ticketsSold,
      cashPaid: acc.cashPaid + s.cashPaid,
      cashCollected: acc.cashCollected + s.cashCollected,
      profitLoss: acc.profitLoss + s.profitLoss,
    }),
    { ticketsSold: 0, cashPaid: 0, cashCollected: 0, profitLoss: 0 }
  );
  const totalsRow = {
    game: `TOTAL — ${sales.length} entr${sales.length === 1 ? "y" : "ies"}`,
    ticketsSold: String(totals.ticketsSold),
    cashPaid: money(totals.cashPaid),
    cashCollected: money(totals.cashCollected),
    profitLoss: money(totals.profitLoss),
  };

  if (y < MARGIN + 40) newPage(false);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE.width - MARGIN, y: y + 14 }, thickness: 1, color: HEADER_RULE_COLOR });
  let x = MARGIN;
  for (const col of COLUMNS) {
    const raw = totalsRow[col.key] ?? "";
    if (raw) {
      const val = truncateToWidth(raw, bold, 9.5, col.width - CELL_PAD);
      const w = bold.widthOfTextAtSize(val, 9.5);
      const drawX = col.align === "right" ? x + col.width - CELL_PAD - w : x;
      page.drawText(val, { x: drawX, y, size: 9.5, font: bold, color: HEADER_RULE_COLOR });
    }
    x += col.width;
  }
  y -= 22;
  page.drawText(`End of report — ${sales.length} entr${sales.length === 1 ? "y" : "ies"} listed.`, { x: MARGIN, y, size: 8, font, color: rgb(0.55, 0.55, 0.55) });

  return doc.save();
}

module.exports = { buildDailySalesReportPdf };
