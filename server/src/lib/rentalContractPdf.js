// Draws the Facility Event Space Rental Agreement from scratch with pdf-lib —
// unlike the GC-7Q form, there's no official blank template to fill; this
// reproduces the lodge's real paper agreement (fields + house rules +
// signatures) as a generated, itemized PDF instead of a hand-totaled one.
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { formatPhone } = require("./phone");

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 54;
const POLICY_LINES = [
  "Reservation Schedule: your rental includes 2 hours before the event for setup and 1 hour after for",
  "cleanup. To reserve your date, a non-refundable deposit plus a signed contract is required.",
  "Kitchen use (stove/oven) requires the kitchen be left in the condition it was found in.",
  "Chafing dishes are available for use; sterno fluid is either supplied by the renter or billed as a fee.",
  "Bartender service must be reserved at least one month in advance.",
  "If the Lodge becomes unusable for any reason beyond its control, the deposit is returned and no",
  "further compensation is granted.",
  "Final payment is due the day of the event. Cash or check only.",
  "The rental area must be left as it was received, including trash removed to the dumpster.",
  "Per NYS law, no alcohol may be brought onto Lodge property, and alcohol served may not be removed",
  "from the premises. Underage drinking (21) is strictly prohibited.",
  "Decorations: no tacks or tape on walls or ceilings, and no confetti.",
];

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function fmtDateTime(d) {
  return new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

async function buildRentalContractPdf({ org, space, booking, quote, balance }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE.height - MARGIN;
  const lineHeight = 15;

  const draw = (text, { x = MARGIN, size = 10, f = font, color = rgb(0, 0, 0), gap = lineHeight } = {}) => {
    page.drawText(text, { x, y, size, font: f, color });
    y -= gap;
  };
  const rule = () => {
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.75, color: rgb(0.8, 0.8, 0.8) });
    y -= 12;
  };

  draw(org.name || "Lodge", { size: 16, f: bold, gap: 20 });
  draw("Facility Event Space Rental Agreement", { size: 12, f: bold, gap: 20 });
  rule();

  draw(`Client: ${booking.renterName}`, { f: bold });
  draw(`Address: ${booking.renterAddress || "—"}`);
  draw(`Phone: ${formatPhone(booking.renterPhone) || "—"}    Email: ${booking.renterEmail}`);
  draw(`Club Member: ${booking.isMember ? "Yes" : "No"}`);
  y -= 6;

  draw(`Space: ${space.name}${space.capacity ? ` (capacity ${space.capacity})` : ""}`, { f: bold });
  draw(`Event: ${booking.eventType || "—"}    Expected guests: ${booking.expectedGuests ?? "—"}`);
  draw(`Start: ${fmtDateTime(booking.startAt)}`);
  draw(`End: ${fmtDateTime(booking.endAt)}`);
  rule();

  draw("Charges", { f: bold, gap: 18 });
  draw(`Space rental (first ${space.blockHours} hrs, ${booking.isMember ? "member" : "non-member"} rate): ${money(quote.spaceCost - (quote.overageHours * (booking.isMember ? space.overageRateMember : space.overageRateNonMember)))}`);
  if (quote.overageHours > 0) {
    const overageRate = booking.isMember ? space.overageRateMember : space.overageRateNonMember;
    draw(`Additional time (${quote.overageHours} hr @ ${money(overageRate)}/hr): ${money(quote.overageHours * overageRate)}`);
  }
  if (booking.wantsBartender) {
    draw(`Bartender service: ${money(quote.bartenderCost)}`);
  }
  if (booking.wantsLinen) {
    draw(`Linen service: ${money(quote.linenCost)}`);
  }
  if (quote.equipmentCost > 0) {
    draw(`Equipment & kitchen fees: ${money(quote.equipmentCost)}`);
  }
  draw(`Total: ${money(quote.total)}`, { f: bold, gap: 18 });

  draw(`Deposit expected: ${money(booking.depositAmount)}`);
  draw(`Total paid to date: ${money(balance.totalPaid)}${balance.totalAdjustments > 0 ? ` (plus ${money(balance.totalAdjustments)} adjustment)` : ""}`);
  draw(
    balance.balanceDue > 0
      ? `Balance due: ${money(balance.balanceDue)} — due day of event`
      : balance.balanceDue < 0
      ? `Paid in full (${money(-balance.balanceDue)} credit)`
      : "Paid in full"
  );
  rule();

  draw("Terms", { f: bold, gap: 16 });
  for (const line of POLICY_LINES) {
    draw(line, { size: 8.5, gap: 12, color: rgb(0.25, 0.25, 0.25) });
  }
  y -= 16;

  draw("Client signature:", { f: bold, gap: lineHeight });
  if (booking.contractSignatureImage) {
    try {
      const base64 = booking.contractSignatureImage.replace(/^data:image\/png;base64,/, "");
      const png = await doc.embedPng(Buffer.from(base64, "base64"));
      const sigHeight = 45;
      const sigWidth = (png.width / png.height) * sigHeight;
      page.drawImage(png, { x: MARGIN, y: y - sigHeight + 8, width: sigWidth, height: sigHeight });
      y -= sigHeight + 4;
    } catch {
      draw("_______________________");
    }
  } else {
    draw("_______________________");
  }
  draw(`Printed name: ${booking.contractSignedName || "_______________________"}`, { gap: lineHeight });
  draw(`Date: ${booking.contractSignedAt ? fmtDateTime(booking.contractSignedAt) : "_______________________"}`, { gap: 24 });
  draw("Lodge representative: _______________________", { gap: lineHeight });
  draw("Date: _______________________");

  return doc.save();
}

module.exports = { buildRentalContractPdf };
