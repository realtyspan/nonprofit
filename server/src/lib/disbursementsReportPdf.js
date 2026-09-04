// Printable snapshot of the Bell Jar "Bank Ledger & Receipts" table
// (Ledger.jsx), filterable by date range and category — same pdf-lib
// tabular-report approach as dailySalesReportPdf.js / schedule1ReportPdf.js
// (repeating column header, page-break handling, a totals row), built
// fresh here for the same reason those were: no shared generic builder
// exists to import. For members who'll only ever see a paper copy of the
// Special Bell Jar Checking Account register.
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 40;
const ROW_HEIGHT = 16;
const CELL_PAD = 8;
const HEADER_RULE_COLOR = rgb(0.13, 0.23, 0.5);

// Mirrors Ledger.jsx's own CATEGORY_META labels — kept here rather than
// shared since this is the only place on the server that needs the label
// text (everywhere else just stores/filters the raw category string).
const CATEGORY_LABELS = {
  ticket_purchase: "Ticket purchase (A5)",
  license_fee: "License fee",
  indirect: "Indirect disbursement",
};

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

// Stored as UTC midnight (date-only, no real time-of-day) — same
// convention as Ledger.jsx's own display, so print with the UTC calendar
// date rather than one that could shift a day depending on server timezone.
function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

function truncateToWidth(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

// Widths sized to the actual rendered header-label/data widths
// (HelveticaBold at 8pt for headers; "Indirect disbursement" is the
// longest category label) plus CELL_PAD.
const COLUMNS = [
  { key: "date", label: "DATE", width: 70 },
  { key: "payee", label: "PAYEE", width: 140 },
  { key: "checkNum", label: "CHECK #", width: 70 },
  { key: "amount", label: "AMOUNT", width: 75, align: "right" },
  { key: "category", label: "CATEGORY", width: 110 },
  { key: "receipt", label: "RECEIPT", width: 67 },
];

async function buildDisbursementsReportPdf({ org, from, to, categoryLabel, rows }) {
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
      page.drawText("Bell Jar Bank Ledger", { x: MARGIN, y, size: 18, font: bold });
      y -= 22;
      page.drawText(`${org.name} · Special Bell Jar Checking Account Register`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
      const rangeLabel = from && to ? `${fmtFilterDate(from)} – ${fmtFilterDate(to)}` : "All time";
      page.drawText(`Category: ${categoryLabel}   ·   Date range: ${rangeLabel}`, { x: MARGIN, y, size: 9.5, font, color: rgb(0.3, 0.3, 0.35) });
      y -= 14;
      page.drawText(`Generated ${fmtGenerated(new Date())}`, { x: MARGIN, y, size: 9, font, color: rgb(0.55, 0.55, 0.55) });
      y -= 18;
    }
    drawHeaderRow();
  }

  newPage(true);

  const tableRows = rows.map((r) => ({
    date: fmtDate(r.date),
    payee: r.payee,
    checkNum: r.checkNum,
    amount: money(r.amount),
    category: CATEGORY_LABELS[r.category] || r.category,
    receipt: r.receiptFile ? "Yes" : "—",
  }));

  for (const row of tableRows) {
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

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalsRow = {
    payee: `TOTAL — ${rows.length} transaction${rows.length === 1 ? "" : "s"}`,
    amount: money(totalAmount),
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
  page.drawText(`End of report — ${rows.length} transaction${rows.length === 1 ? "" : "s"} listed.`, { x: MARGIN, y, size: 8, font, color: rgb(0.55, 0.55, 0.55) });

  return doc.save();
}

module.exports = { buildDisbursementsReportPdf };
