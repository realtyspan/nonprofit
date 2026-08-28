// Parses pasted/uploaded CSVs of past-years golf data into rows ready to
// insert — same XLSX-based approach as raffleHistoricalImport.js (handles
// quoted fields correctly rather than hand-rolling a splitter), split into
// two parsers since golf has two distinct historical lists: players (grouped
// into teams) and sponsors.
const XLSX = require("xlsx");

function normalizeKey(key) {
  return String(key || "").trim().toLowerCase().replace(/[^a-z0-9#]/g, "");
}

function buildFieldMap(headerRow, aliasTable) {
  const map = {}; // raw source header -> our field name
  for (const raw of headerRow) {
    const norm = normalizeKey(raw);
    for (const [field, aliases] of Object.entries(aliasTable)) {
      if (aliases.includes(norm)) map[raw] = field;
    }
  }
  return map;
}

function readRows(csvText) {
  const workbook = XLSX.read(csvText, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

const PLAYER_HEADER_ALIASES = {
  teamName: ["team", "teamname"],
  name: ["player", "playername", "name"],
  email: ["email"],
  phone: ["phone", "phonenumber"],
  isCaptain: ["captain", "iscaptain"],
};

// Returns { rows, skipped } where rows are { teamName, name, email, phone, isCaptain }
// — teamName is optional (blank means "this player is their own one-person
// team" rather than being grouped with anyone); name is required. Rows
// sharing the same (trimmed, case-insensitive) team name are grouped into one
// team by the caller, same "skip the bad row, keep going" tolerance as
// raffle's parser — real historical spreadsheets are rarely perfectly clean.
function parseHistoricalPlayersCsv(csvText) {
  const raw = readRows(csvText);
  if (raw.length === 0) return { rows: [], skipped: 0 };

  const fieldMap = buildFieldMap(raw[0], PLAYER_HEADER_ALIASES);
  if (!Object.values(fieldMap).includes("name")) {
    throw new Error('The file needs at least a "Player Name" column');
  }

  const rows = [];
  let skipped = 0;
  for (const line of raw.slice(1)) {
    const record = {};
    raw[0].forEach((header, i) => {
      const field = fieldMap[header];
      if (field) record[field] = line[i];
    });

    const name = String(record.name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const captainRaw = String(record.isCaptain || "").trim().toLowerCase();
    rows.push({
      teamName: String(record.teamName || "").trim() || null,
      name,
      email: String(record.email || "").trim(),
      phone: String(record.phone || "").trim(),
      isCaptain: ["yes", "y", "true", "1"].includes(captainRaw) ? true : ["no", "n", "false", "0"].includes(captainRaw) ? false : null,
    });
  }
  return { rows, skipped };
}

const SPONSOR_HEADER_ALIASES = {
  companyName: ["company", "companyname", "sponsor", "business", "businessname"],
  contactName: ["contact", "contactname"],
  email: ["email"],
  phone: ["phone", "phonenumber"],
  tierName: ["tier", "tiername", "level"],
  amount: ["amount", "sponsorshipamount"],
};

// Returns { rows, skipped } where rows are { companyName, contactName, email, phone, tierName, amount }
// — companyName is required, everything else optional.
function parseHistoricalSponsorsCsv(csvText) {
  const raw = readRows(csvText);
  if (raw.length === 0) return { rows: [], skipped: 0 };

  const fieldMap = buildFieldMap(raw[0], SPONSOR_HEADER_ALIASES);
  if (!Object.values(fieldMap).includes("companyName")) {
    throw new Error('The file needs at least a "Company" column');
  }

  const rows = [];
  let skipped = 0;
  for (const line of raw.slice(1)) {
    const record = {};
    raw[0].forEach((header, i) => {
      const field = fieldMap[header];
      if (field) record[field] = line[i];
    });

    const companyName = String(record.companyName || "").trim();
    if (!companyName) {
      skipped += 1;
      continue;
    }

    const amount = Number(record.amount);
    rows.push({
      companyName,
      contactName: String(record.contactName || "").trim(),
      email: String(record.email || "").trim(),
      phone: String(record.phone || "").trim(),
      tierName: String(record.tierName || "").trim(),
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    });
  }
  return { rows, skipped };
}

module.exports = { parseHistoricalPlayersCsv, parseHistoricalSponsorsCsv };
