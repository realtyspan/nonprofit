// Parses uploaded historical golf spreadsheets (xlsx or csv) into rows ready
// to insert. Two independent lists — players (grouped into teams) and
// sponsors — same split as raffleHistoricalImport.js's single-list
// equivalent, doubled.
//
// Two parse paths feed the same target shape:
//  - interpretPlayerRows/interpretSponsorRows: fast, free, deterministic —
//    recognizes the documented format (see RECOMMENDED_PLAYER_FORMAT below)
//    and a couple of real-world variants (see the "Captain column holds a
//    repeated name" note). Returns `confident: false` when it can't find a
//    usable name/company column at all, so the caller knows to offer the AI
//    fallback instead of silently importing nothing.
//  - golfHistoricalImportAi.js's extractPlayersFromRows/extractSponsorsFromRows
//    handle everything else, for a file that doesn't match any recognized
//    shape — always reviewed before anything commits, same as this app's
//    other AI-assisted feature (the Bell Jar label scanner).
const XLSX = require("xlsx");

const RECOMMENDED_PLAYER_FORMAT = "Name, Phone, Email, Captain (yes/no), Team";
const RECOMMENDED_SPONSOR_FORMAT = "Company, Contact, Phone, Email, Tier, Amount";

function normalizeKey(key) {
  // Keeps "#" (unlike stripping every non-alphanumeric) specifically so a
  // "Team#" column — a team NUMBER, seen in real lodge spreadsheets — never
  // accidentally collides with the "team"/"teamname" aliases below, which
  // mean a team NAME. Confirmed against a real file: without this, a
  // captain's own row (the only one with Team# filled in) got grouped by
  // that number instead of the shared captain-name key their teammates use,
  // splitting them into two mismatched groups.
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

// Reads an uploaded file's raw bytes into header-less rows (array of
// arrays) — works for .xlsx and .csv alike, since XLSX.read auto-detects
// the format. First sheet only, matching every other xlsx upload in this
// app (FRS report, this same import previously).
function readWorkbookRows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("That file has no sheets");
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
}

const PLAYER_HEADER_ALIASES = {
  teamName: ["team", "teamname"],
  name: ["player", "playername", "name"],
  email: ["email"],
  phone: ["phone", "phonenumber"],
  isCaptain: ["captain", "iscaptain"],
};

// rawRows: array of arrays, first row is headers (e.g. from readWorkbookRows,
// or XLSX.read of a pasted CSV string). Returns { rows, skipped, confident } —
// rows are { teamKey, name, email, phone, isCaptain }; confident is false
// when no recognizable name column was found at all, signaling the caller to
// offer the AI fallback instead of reporting "0 players imported."
function interpretPlayerRows(rawRows) {
  if (rawRows.length === 0) return { rows: [], skipped: 0, confident: false };

  const fieldMap = buildFieldMap(rawRows[0], PLAYER_HEADER_ALIASES);
  if (!Object.values(fieldMap).includes("name")) {
    return { rows: [], skipped: 0, confident: false };
  }

  const rows = [];
  let skipped = 0;
  for (const line of rawRows.slice(1)) {
    const record = {};
    rawRows[0].forEach((header, i) => {
      const field = fieldMap[header];
      if (field) record[field] = line[i];
    });

    const name = String(record.name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    // The Captain column is normally a yes/no flag, but some lodges instead
    // repeat the captain's own name down the column for every row in that
    // person's group (their real historical spreadsheets look like this —
    // no separate Team column at all). When it's not a recognized yes/no
    // token, treat it as "this row's captain is named X" AND, when there's
    // no explicit Team value already, use that same name as the grouping
    // key — it's already unique per team and repeated on every member's row,
    // exactly like a Team column would be.
    const captainRaw = String(record.isCaptain || "").trim();
    const captainLower = captainRaw.toLowerCase();
    let isCaptain = null;
    let impliedTeamKey = null;
    if (["yes", "y", "true", "1"].includes(captainLower)) {
      isCaptain = true;
    } else if (["no", "n", "false", "0"].includes(captainLower)) {
      isCaptain = false;
    } else if (captainRaw) {
      isCaptain = name.toLowerCase() === captainLower;
      impliedTeamKey = captainRaw;
    }

    rows.push({
      teamKey: String(record.teamName || "").trim() || impliedTeamKey || null,
      name,
      email: String(record.email || "").trim(),
      phone: String(record.phone || "").trim(),
      isCaptain,
    });
  }
  return { rows, skipped, confident: true };
}

const SPONSOR_HEADER_ALIASES = {
  companyName: ["company", "companyname", "sponsor", "business", "businessname"],
  contactName: ["contact", "contactname"],
  email: ["email"],
  phone: ["phone", "phonenumber"],
  tierName: ["tier", "tiername", "level"],
  amount: ["amount", "sponsorshipamount"],
};

function interpretSponsorRows(rawRows) {
  if (rawRows.length === 0) return { rows: [], skipped: 0, confident: false };

  const fieldMap = buildFieldMap(rawRows[0], SPONSOR_HEADER_ALIASES);
  if (!Object.values(fieldMap).includes("companyName")) {
    return { rows: [], skipped: 0, confident: false };
  }

  const rows = [];
  let skipped = 0;
  for (const line of rawRows.slice(1)) {
    const record = {};
    rawRows[0].forEach((header, i) => {
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
  return { rows, skipped, confident: true };
}

module.exports = {
  RECOMMENDED_PLAYER_FORMAT,
  RECOMMENDED_SPONSOR_FORMAT,
  readWorkbookRows,
  interpretPlayerRows,
  interpretSponsorRows,
};
