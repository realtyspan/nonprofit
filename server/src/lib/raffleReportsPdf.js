// Multi-page tabular report PDFs for the Raffle module (Seller Activity,
// Tickets Turned In) — same pdf-lib approach as rentalContractPdf.js, extended
// with a repeating column header and page-break handling since these can run
// to hundreds of rows.
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { formatPhone } = require("./phone");

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 40;
const ROW_HEIGHT = 16;
const CELL_PAD = 8; // gap reserved at the right edge of every column, so a right-aligned value never touches the next column's text
const HEADER_RULE_COLOR = rgb(0.13, 0.23, 0.5);

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

function fmtGenerated(d) {
  return new Date(d).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
}

// Trims text with an ellipsis until it fits maxWidth at the given font/size.
function truncateToWidth(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

async function buildTableReportPdf({ title, org, gameName, raffleYear, columns, rows, totalsRow, footerNote }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page;
  let y;

  function drawHeaderRow() {
    page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: PAGE.width - MARGIN, y: y + 10 }, thickness: 1, color: HEADER_RULE_COLOR });
    let x = MARGIN;
    for (const col of columns) {
      const w = font.widthOfTextAtSize(col.label, 8);
      const drawX = col.align === "right" ? x + col.width - CELL_PAD - w : x;
      page.drawText(col.label, { x: drawX, y, size: 8, font: bold, color: rgb(0.25, 0.25, 0.32) });
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
      page.drawText(title, { x: MARGIN, y, size: 18, font: bold });
      y -= 22;
      page.drawText(`${org.name} · ${gameName} · Raffle Year ${raffleYear}`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 14;
      page.drawText(`Generated ${fmtGenerated(new Date())}`, { x: MARGIN, y, size: 9, font, color: rgb(0.55, 0.55, 0.55) });
      y -= 18;
    }
    drawHeaderRow();
  }

  newPage(true);
  for (const row of rows) {
    if (y < MARGIN + 30) newPage(false);
    let x = MARGIN;
    for (const col of columns) {
      const raw = String(row[col.key] ?? "");
      const val = truncateToWidth(raw, font, 8.5, col.width - CELL_PAD);
      const w = font.widthOfTextAtSize(val, 8.5);
      const drawX = col.align === "right" ? x + col.width - CELL_PAD - w : x;
      page.drawText(val, { x: drawX, y, size: 8.5, font, color: rgb(0.12, 0.12, 0.14) });
      x += col.width;
    }
    y -= ROW_HEIGHT;
  }

  if (y < MARGIN + 40) newPage(false);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE.width - MARGIN, y: y + 14 }, thickness: 1, color: HEADER_RULE_COLOR });
  let x = MARGIN;
  for (const col of columns) {
    const raw = String(totalsRow[col.key] ?? "");
    if (raw) {
      const val = truncateToWidth(raw, bold, 9.5, col.width - CELL_PAD);
      const w = bold.widthOfTextAtSize(val, 9.5);
      const drawX = col.align === "right" ? x + col.width - CELL_PAD - w : x;
      page.drawText(val, { x: drawX, y, size: 9.5, font: bold, color: HEADER_RULE_COLOR });
    }
    x += col.width;
  }
  y -= 22;
  if (footerNote) page.drawText(footerNote, { x: MARGIN, y, size: 8, font, color: rgb(0.55, 0.55, 0.55) });

  return doc.save();
}

async function buildSellerActivityReportPdf({ org, game, sellers }) {
  const totals = sellers.reduce(
    (acc, s) => ({
      assigned: acc.assigned + s.assigned,
      sold: acc.sold + s.sold,
      fundsIn: acc.fundsIn + s.fundsIn,
      collected: acc.collected + s.collected,
    }),
    { assigned: 0, sold: 0, fundsIn: 0, collected: 0 }
  );

  const columns = [
    { key: "idx", label: "#", width: 30 },
    { key: "name", label: "SELLER NAME", width: 170 },
    { key: "assigned", label: "TICKETS ASSIGNED", width: 90, align: "right" },
    { key: "sold", label: "TICKETS SOLD", width: 80, align: "right" },
    { key: "fundsIn", label: "FUNDS TURNED IN", width: 90, align: "right" },
    { key: "collected", label: "$ COLLECTED", width: 72, align: "right" },
  ];
  const rows = sellers.map((s, i) => ({
    idx: String(i + 1),
    name: s.name,
    assigned: String(s.assigned),
    sold: String(s.sold),
    fundsIn: String(s.fundsIn),
    collected: money(s.collected),
  }));
  const totalsRow = {
    name: "TOTAL",
    assigned: String(totals.assigned),
    sold: String(totals.sold),
    fundsIn: String(totals.fundsIn),
    collected: money(totals.collected),
  };

  return buildTableReportPdf({
    title: "Seller Activity Report",
    org,
    gameName: game.name,
    raffleYear: new Date(game.raffleEndDate).getFullYear(),
    columns,
    rows,
    totalsRow,
    footerNote: `End of report — ${sellers.length} seller${sellers.length === 1 ? "" : "s"} listed.`,
  });
}

async function buildTicketsTurnedInReportPdf({ org, game, tickets }) {
  const columns = [
    { key: "number", label: "TICKET #", width: 55, align: "right" },
    { key: "buyer", label: "BUYER NAME", width: 150 },
    { key: "phone", label: "PHONE", width: 90 },
    { key: "tender", label: "TENDER", width: 90 },
    { key: "amount", label: "AMOUNT", width: 60, align: "right" },
    { key: "seller", label: "SELLER", width: 87 },
  ];
  const rows = tickets.map((t) => ({
    number: `#${t.number}`,
    buyer: t.buyer || "—",
    phone: formatPhone(t.phone) || "—",
    tender: t.tenderType === "check" ? `Check${t.checkNumber ? ` #${t.checkNumber}` : ""}` : t.tenderType === "cash" ? "Cash" : "Not recorded",
    amount: money(t.tenderAmount),
    seller: t.assignedSellerName || "—",
  }));
  const totalAmount = tickets.reduce((sum, t) => sum + (Number(t.tenderAmount) || 0), 0);
  const totalsRow = { buyer: `TOTAL — ${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`, amount: money(totalAmount) };

  return buildTableReportPdf({
    title: "Tickets Turned In Report",
    org,
    gameName: game.name,
    raffleYear: new Date(game.raffleEndDate).getFullYear(),
    columns,
    rows,
    totalsRow,
    footerNote: `End of report — ${tickets.length} ticket${tickets.length === 1 ? "" : "s"} listed.`,
  });
}

module.exports = { buildSellerActivityReportPdf, buildTicketsTurnedInReportPdf };
