const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const TEMPLATE_PATH = path.join(__dirname, "../../templates/schedule1_0924.pdf");
const ROWS_PER_PAGE = 5;

// Exact field names read off the real NYS Schedule 1 (schedule1_0924.pdf) AcroForm —
// the form's own naming is inconsistent (spacing/typos vary row to row), so each
// row's field names are listed explicitly rather than templated from a pattern.
const ROW_FIELDS = [
  { name: "Name of Deal 1", formNum: "Form # 1", serialNum: "Serial # 1", ticketCount: "Ticket Count 1", ticketPrice: "Ticket Price 1", ticketValue: "Ticket Value 1", idealPayout: "Ideal Payout 1", cashPrizes: "Cash Prizes 1", otherPrizes: "Other Prizes 1", totalPrizes: "Total Prizes 1", unsoldCount: "# of Unsold Tickets 1", unsoldValue: "Unsold Ticket Value 1", profit: "Actual Profit or Loss 1" },
  { name: "Name of Deal 2", formNum: "Form # 2", serialNum: "Serial # 2", ticketCount: "Ticket Count 2", ticketPrice: "Ticket Price 2", ticketValue: "Ticket Value 2", idealPayout: "Ideal Payout 2", cashPrizes: "Cash Prizes 2", otherPrizes: "Other Prizes 2", totalPrizes: "Total Prizes 2", unsoldCount: "# of Unsold Tickets 2", unsoldValue: "Unsold Ticket Value 2", profit: "Actual Profit or Loss 2" },
  { name: "Name of Deal 3", formNum: "Form #3", serialNum: "Serial #3", ticketCount: "Ticket Count 3", ticketPrice: "Ticket Price 3", ticketValue: "Ticket Value 3", idealPayout: "Ideal Payout 3", cashPrizes: "Cash Prizes 3", otherPrizes: "Other Prizes 3", totalPrizes: "Total Prizes 3", unsoldCount: "# of Unsold Tickets 3", unsoldValue: "Unsold Ticket Value 3", profit: "Actual Profit or Loss 3" },
  { name: "Name of Deal 4", formNum: "Form #4", serialNum: "Serial #4", ticketCount: "Ticket Count 4", ticketPrice: "Ticket Price 4", ticketValue: "Ticket Value 4", idealPayout: "Ideal Payout 4", cashPrizes: "Cash Prizes 4", otherPrizes: "Other Prizes 4", totalPrizes: "Total Prizes 4", unsoldCount: "# of Unsold Tickets 4", unsoldValue: "Unsold Ticket Value 4", profit: "Actual Profit or Loss 4" },
  { name: "Name of Deal 5", formNum: "Form #5", serialNum: "Serial #5", ticketCount: "Ticket Count 5", ticketPrice: "Ticket Price 5", ticketValue: "Ticket Value 5", idealPayout: "Ideal Payout 5", cashPrizes: "Cash Prizes 5", otherPrizes: "Other Prizes 5", totalPrizes: "Total Prizes 5", unsoldCount: "# of Unsold Tickets 5", unsoldValue: "Unsold Ticket Value 5", profit: "Actual Profit of Loss 5" }, // form's own typo: "of" not "or"
];

const TOTAL_FIELDS = {
  ticketValue: "Total Ticket Value add to GC7Q line A2 Q",
  cashPrizes: "Total Cash Prizes add to GC7Q line A3 R",
  unsoldValue: "Total Unsold Value add to GC7Q line A4 S",
  dealCount: "Total  of Closed Deals add to GC7Q line A1 T",
};

function num(n) {
  return Number(n || 0).toFixed(2);
}

function set(form, fieldName, value) {
  try {
    form.getTextField(fieldName).setText(String(value ?? ""));
  } catch {
    // Field not present on this template revision — skip rather than crash the whole render.
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// header: { quarter, year, county, municipality, category, licenseLast5 }
// deals: [{ name, formNum, serialNum, ticketCount, ticketPrice, ticketValue, idealPayout, cashPrizes, otherPrizes, totalPrizes, unsoldCount, unsoldValue, profit }]
async function fillSchedule1Pdf({ deals, header }) {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pages = chunk(deals, ROWS_PER_PAGE);
  if (pages.length === 0) pages.push([]); // zero-filing quarter still produces one (blank) page

  const finalPdf = await PDFDocument.create();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pdf = await PDFDocument.load(templateBytes);
    const form = pdf.getForm();

    set(form, "Quarter", header.quarter);
    set(form, "Year", header.year);
    set(form, "County", header.county);
    set(form, "Municipality", header.municipality);
    set(form, "Category", header.category);
    set(form, "Last 5 digits", header.licenseLast5);
    set(form, "Current Page", pageIdx + 1);
    set(form, "Last Page", pages.length);

    const rows = pages[pageIdx];
    rows.forEach((d, i) => {
      const f = ROW_FIELDS[i];
      set(form, f.name, d.name);
      set(form, f.formNum, d.formNum);
      set(form, f.serialNum, d.serialNum);
      set(form, f.ticketCount, d.ticketCount);
      set(form, f.ticketPrice, num(d.ticketPrice));
      set(form, f.ticketValue, num(d.ticketValue));
      set(form, f.idealPayout, num(d.idealPayout));
      set(form, f.cashPrizes, num(d.cashPrizes));
      set(form, f.otherPrizes, num(d.otherPrizes));
      set(form, f.totalPrizes, num(d.totalPrizes));
      set(form, f.unsoldCount, d.unsoldCount);
      set(form, f.unsoldValue, num(d.unsoldValue));
      set(form, f.profit, num(d.profit));
    });

    set(form, TOTAL_FIELDS.ticketValue, num(rows.reduce((s, d) => s + d.ticketValue, 0)));
    set(form, TOTAL_FIELDS.cashPrizes, num(rows.reduce((s, d) => s + d.cashPrizes, 0)));
    set(form, TOTAL_FIELDS.unsoldValue, num(rows.reduce((s, d) => s + d.unsoldValue, 0)));
    set(form, TOTAL_FIELDS.dealCount, rows.length);

    // Flatten before merging: each page's AcroForm reuses the same field names,
    // so leaving them "live" would collide across pages once copied into one document.
    form.flatten();

    const [copiedPage] = await finalPdf.copyPages(pdf, [0]);
    finalPdf.addPage(copiedPage);
  }

  return finalPdf.save();
}

module.exports = { fillSchedule1Pdf };
