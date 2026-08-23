// Parses a pasted/uploaded CSV of past-years raffle sales into ticket rows
// ready to insert. Reuses the xlsx package (already a server dependency for
// the FRS report) since its CSV reader handles quoted fields (e.g. addresses
// with commas) correctly, rather than hand-rolling a splitter.
const XLSX = require("xlsx");

// Recognized header aliases, case/space/punctuation-insensitive.
const HEADER_ALIASES = {
  number: ["ticketnumber", "ticket", "number", "ticketno", "ticket#"],
  buyer: ["buyer", "buyername", "name"],
  phone: ["phone", "phonenumber"],
  email: ["email"],
  address: ["address"],
  sellerName: ["seller", "sellername", "assignedseller"],
  amount: ["amount", "tenderamount", "price"],
};

function normalizeKey(key) {
  return String(key || "").trim().toLowerCase().replace(/[^a-z0-9#]/g, "");
}

function buildFieldMap(headerRow) {
  const map = {}; // normalized source header -> our field name
  for (const raw of headerRow) {
    const norm = normalizeKey(raw);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm)) map[raw] = field;
    }
  }
  return map;
}

// Returns { rows, skipped } where rows are { number, buyer, phone, email, address, sellerName, amount }
// with number/buyer required — everything else optional. Rows missing a
// number or buyer, or repeating a ticket number already seen, are skipped
// rather than rejecting the whole file, since real historical spreadsheets
// are rarely perfectly clean.
function parseHistoricalCsv(csvText) {
  const workbook = XLSX.read(csvText, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (raw.length === 0) return { rows: [], skipped: 0 };

  const fieldMap = buildFieldMap(raw[0]);
  if (!Object.values(fieldMap).includes("number") || !Object.values(fieldMap).includes("buyer")) {
    throw new Error('The file needs at least a "Ticket Number" and a "Buyer" column');
  }

  const rows = [];
  const seen = new Set();
  let skipped = 0;
  for (const line of raw.slice(1)) {
    const record = {};
    raw[0].forEach((header, i) => {
      const field = fieldMap[header];
      if (field) record[field] = line[i];
    });

    const number = Number(record.number);
    const buyer = String(record.buyer || "").trim();
    if (!Number.isInteger(number) || number <= 0 || !buyer || seen.has(number)) {
      skipped += 1;
      continue;
    }
    seen.add(number);

    const amount = Number(record.amount);
    rows.push({
      number,
      buyer,
      phone: String(record.phone || "").trim(),
      email: String(record.email || "").trim(),
      address: String(record.address || "").trim(),
      sellerName: String(record.sellerName || "").trim(),
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    });
  }
  return { rows, skipped };
}

module.exports = { parseHistoricalCsv };
