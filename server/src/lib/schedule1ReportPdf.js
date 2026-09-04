// Printable snapshot of the Bell Jar "Schedule 1 — closed-game history"
// table (Deals.jsx), filterable by closed-date range — same pdf-lib
// tabular-report approach as dailySalesReportPdf.js (repeating column
// header, page-break handling, a totals row), built fresh here for the
// same reason that file was: no shared generic builder exists to import.
//
// Not to be confused with schedule1Pdf.js's fillSchedule1Pdf — that one
// overlays the real NYS Schedule 1 government form for a specific filing
// quarter (see schedule1.js's GET /:year/:quarter/pdf). This is a plain,
// easy-to-read paper copy of the org's own closed-game history for
// whatever date range someone wants, for members who'll never look at a
// screen — not a filing document.
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

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" });
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
// 8pt) plus CELL_PAD, same discipline as dailySalesReportPdf.js's columns.
const COLUMNS = [
  { key: "game", label: "GAME", width: 130 },
  { key: "closedDate", label: "CLOSED DATE", width: 75 },
  { key: "prizes", label: "PRIZES (M)", width: 75, align: "right" },
  { key: "unsold", label: "UNSOLD VALUE (O)", width: 92, align: "right" },
  { key: "profit", label: "PROFIT (P)", width: 75, align: "right" },
  { key: "retention", label: "RETENTION UNTIL", width: 85 },
];

async function buildSchedule1ReportPdf({ org, from, to, records }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page;
  let y;

  function drawHeaderRow() {
    page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: PAGE.width - MARGIN, y: y + 10 }, thickness: 1, color: HEADER_RULE_COLOR });
    let x = MARGIN;
    for (const col of COLUMNS) {
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
      page.drawText("Bell Jar Schedule 1 History", { x: MARGIN, y, size: 18, font: bold });
      y -= 22;
      page.drawText(`${org.name} · Closed-Game History Report`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
      const rangeLabel = from && to ? `${fmtFilterDate(from)} – ${fmtFilterDate(to)}` : "All time";
      page.drawText(`Closed date range: ${rangeLabel}`, { x: MARGIN, y, size: 9.5, font, color: rgb(0.3, 0.3, 0.35) });
      y -= 14;
      page.drawText(`Generated ${fmtGenerated(new Date())}`, { x: MARGIN, y, size: 9, font, color: rgb(0.55, 0.55, 0.55) });
      y -= 18;
    }
    drawHeaderRow();
  }

  newPage(true);

  const rows = records.map((r) => ({
    game: r.deal.name,
    closedDate: fmtDate(r.closedDate),
    prizes: money(r.cashPrizes + r.otherPrizes),
    unsold: money(r.unsoldValue),
    profit: money(r.actualProfit),
    retention: fmtDate(r.retentionUntil),
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

  const totals = records.reduce(
    (acc, r) => ({
      prizes: acc.prizes + r.cashPrizes + r.otherPrizes,
      unsold: acc.unsold + r.unsoldValue,
      profit: acc.profit + r.actualProfit,
    }),
    { prizes: 0, unsold: 0, profit: 0 }
  );
  const totalsRow = {
    game: `TOTAL — ${records.length} game${records.length === 1 ? "" : "s"}`,
    prizes: money(totals.prizes),
    unsold: money(totals.unsold),
    profit: money(totals.profit),
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
  page.drawText(`End of report — ${records.length} game${records.length === 1 ? "" : "s"} listed.`, { x: MARGIN, y, size: 8, font, color: rgb(0.55, 0.55, 0.55) });

  return doc.save();
}

module.exports = { buildSchedule1ReportPdf };
