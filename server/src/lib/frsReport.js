const XLSX = require("xlsx");

const LODGE_NUMBER = "2022";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A month-label row repeats the file's own month/year string (e.g. "April
// 2026") in the account column right after the header row — same text as
// row 2's title, so it's recognized generically rather than via a hardcoded
// year list (the skill's own example list would go stale every January).
function isMonthLabel(value) {
  const s = String(value).trim();
  return MONTH_NAMES.some((m) => new RegExp(`^${m}\\s+\\d{4}$`, "i").test(s));
}

// Strips a trailing .0 from a whole-number GL account (10201.0 -> 10201) but
// preserves a real decimal (40130.6 stays 40130.6) — same rule as the skill.
function formatGLAccount(value) {
  const s = String(value).trim();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

// Excel serial dates come through as numbers when the sheet is read with
// raw:true; XLSX.SSF converts using the same 1900 date system Excel uses.
function formatDate(value) {
  let d;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "number") {
    d = XLSX.SSF.parse_date_code(value);
    d = new Date(d.y, d.m - 1, d.d);
  } else {
    d = new Date(String(value));
  }
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Direct port of the elks-frs-report skill's documented steps: given the raw
// bytes of a QuickBooks "Transaction Detail by Account" .xlsx export, returns
// the 4-column LodgeNumber/LodgeGLAccount/Date/Amount CSV the Grand Lodge
// requires. Fully deterministic — no AI involved, matching every other
// financial calculation in this app (computeRaffleFinancials, etc.).
function generateFrsReport(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The uploaded file has no sheets");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });

  if (rows.length < 6) {
    throw new Error("This doesn't look like a Transaction Detail by Account export — too few rows");
  }

  // The month/year header appears somewhere in the file's first few rows —
  // its own position isn't fixed (this lodge's real exports put the lodge
  // name and "FRS Report Template" in swapped order from month to month), so
  // scan for it rather than trusting a specific row index. Checked early,
  // before any transaction parsing: this also doubles as which month/year
  // the saved report gets filed under (FrsReportRun is keyed by org + year +
  // month, one save slot per month), so silently guessing here — as this
  // used to do, falling back to "Unknown" and today's real date — risked a
  // broken upload quietly overwriting an already-saved, legitimate report
  // for whatever month "today" happened to be.
  const monthMatch = rows.slice(0, 4)
    .map((r) => /^([A-Za-z]+)\s+(\d{4})$/.exec(String(r?.[0] || "").trim()))
    .find(Boolean);
  if (!monthMatch || !MONTH_NAMES.includes(monthMatch[1])) {
    throw new Error("Couldn't find the month/year header in this file (e.g. \"April 2026\") — make sure you're uploading the unedited Transaction Detail by Account export from QuickBooks.");
  }
  const monthName = monthMatch[1];
  const year = Number(monthMatch[2]);
  const month = MONTH_NAMES.indexOf(monthName) + 1;

  const totalRowIndex = rows.findIndex((r) => typeof r[0] === "string" && r[0].trim().startsWith("Total for"));
  const lastDataRow = totalRowIndex >= 0 ? totalRowIndex : rows.length - 6;

  const output = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (let i = 5; i < lastDataRow; i++) {
    const row = rows[i] || [];
    const account = row[1];
    const date = row[2];
    const debitRaw = row[3];
    const creditRaw = row[4];

    if (account === null || account === undefined || String(account).trim() === "") continue;
    if (date === null || date === undefined || String(date).trim() === "") continue;
    if (isMonthLabel(account) || String(account).trim().toUpperCase() === "TOTAL") continue;

    const debit = toNumber(debitRaw);
    const credit = toNumber(creditRaw);
    totalDebits += debit;
    totalCredits += credit;

    const amount = debit - credit;
    if (amount === 0) continue;

    const formattedDate = formatDate(date);
    if (!formattedDate) continue;

    output.push({
      LodgeNumber: LODGE_NUMBER,
      LodgeGLAccount: formatGLAccount(account),
      Date: formattedDate,
      Amount: amount.toFixed(2),
    });
  }

  if (output.length === 0) {
    throw new Error("No transaction rows were found in this file — check that you uploaded the Transaction Detail by Account export");
  }

  const sum = output.reduce((acc, r) => acc + Number(r.Amount), 0);
  if (Math.abs(sum) >= 0.01) {
    throw new Error(`This file does not balance — the transactions sum to ${sum.toFixed(2)} instead of 0.00. Double-check the export before submitting.`);
  }

  const filename = `${LODGE_NUMBER}_${monthName}_${year}_Actual.csv`;

  const header = "LodgeNumber,LodgeGLAccount,Date,Amount";
  const csvRows = output.map((r) => `${r.LodgeNumber},${r.LodgeGLAccount},${r.Date},${r.Amount}`);
  const csv = [header, ...csvRows].join("\n");

  return {
    csv,
    filename,
    transactionCount: output.length,
    totalDebits: Number(totalDebits.toFixed(2)),
    totalCredits: Number(totalCredits.toFixed(2)),
    monthName,
    year,
    month,
    monthLabel: `${monthName} ${year}`,
  };
}

module.exports = { generateFrsReport };
