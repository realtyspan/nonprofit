// AI-assisted fallback for a historical golf spreadsheet that doesn't match
// any shape interpretPlayerRows/interpretSponsorRows (golfHistoricalImport.js)
// recognizes — same philosophy as labelScan.js's game-label reader: the
// result only ever pre-fills a review screen the org confirms or corrects
// before anything saves, so an imperfect read here is a UX cost, not a
// data-integrity risk the way a silent misimport would be.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Generous but bounded — a lodge-scale tournament roster or sponsor list is
// realistically a few hundred rows at most; well past that, something is
// probably wrong with the file (an extra sheet's worth of unrelated data,
// a report export with hundreds of blank trailing rows) and it's better to
// say so than to silently truncate real data out of an import.
const MAX_ROWS = 800;

function rowsToText(rawRows) {
  return rawRows
    .slice(0, MAX_ROWS)
    .map((row, i) => `${i}: ${row.map((cell) => (cell === "" || cell == null ? "·" : String(cell))).join(" | ")}`)
    .join("\n");
}

function extractJson(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The AI reader didn't return a recognizable list — try again, or reformat the file");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function callClaude(prompt, maxTokens) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("AI-assisted import isn't configured for this deployment (missing ANTHROPIC_API_KEY)");
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI-assisted import failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("AI-assisted import returned no text content");
  return extractJson(textBlock.text);
}

const PLAYER_PROMPT_HEADER = `Below is a spreadsheet of golf tournament players, one row per line, cells separated by " | " (a "·" means a blank cell). It does NOT necessarily match any standard format — column meanings, grouping, and captain markers vary by organization. Your job is to read it like a person would and extract every player into a flat JSON array.

For each player, determine:
- name: the player's full name. Required — skip any row that has no real person's name.
- phone: a phone number if present anywhere for this person, else "".
- email: an email address if present anywhere for this person, else "".
- isCaptain: true if this specific row is identifiable as a team's captain/organizer, false if identifiably not, or null if there's no captain information at all in this file.
- teamKey: a short string shared by every player on the same team (e.g. reuse the captain's name, or a label like "Team 1") — assign it however the sheet's own structure implies grouping (a blank separator row between groups, a repeated name or number in one column, an explicit team-name column, etc.). Use null if a player has no evident team.

Common patterns to watch for, though the actual file may differ:
- A blank row between groups of players usually marks a team boundary.
- A "Captain" column sometimes holds yes/no, but sometimes instead holds the captain's own name repeated on every row of that team — in that case the row where the player's own name matches that value is the captain, and that repeated name doubles as the team grouping key.
- Extra columns (dates, payment status, ticket/team numbers, notes) are not part of what you're extracting — ignore them.

Respond with ONLY a JSON array of objects with exactly these keys: name, phone, email, isCaptain, teamKey. Nothing else — no explanation, no markdown fencing.

Spreadsheet:
`;

const SPONSOR_PROMPT_HEADER = `Below is a spreadsheet of golf tournament sponsors, one row per line, cells separated by " | " (a "·" means a blank cell). It does NOT necessarily match any standard format — column meanings vary by organization. Your job is to read it like a person would and extract every sponsor into a flat JSON array.

For each sponsor, determine:
- companyName: the sponsoring business/organization's name. Required — skip any row with no real company name.
- contactName: a contact person's name if present, else "".
- phone: a phone number if present, else "".
- email: an email address if present, else "".
- tierName: a sponsorship level/tier label if present (e.g. "Gold", "Hole Sponsor"), else "".
- amount: the sponsorship dollar amount as a plain number if present, else null.

Extra columns (dates, payment status, notes) are not part of what you're extracting — ignore them.

Respond with ONLY a JSON array of objects with exactly these keys: companyName, contactName, phone, email, tierName, amount. Nothing else — no explanation, no markdown fencing.

Spreadsheet:
`;

async function extractPlayersFromRows(rawRows) {
  if (rawRows.length > MAX_ROWS) {
    throw Object.assign(new Error(`This file has ${rawRows.length} rows — AI-assisted reading is limited to ${MAX_ROWS} at a time. Try splitting it into smaller files.`), { status: 400 });
  }
  const rows = await callClaude(PLAYER_PROMPT_HEADER + rowsToText(rawRows), 8000);
  return rows
    .filter((r) => r && typeof r.name === "string" && r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      email: typeof r.email === "string" ? r.email.trim() : "",
      phone: typeof r.phone === "string" ? r.phone.trim() : "",
      isCaptain: typeof r.isCaptain === "boolean" ? r.isCaptain : null,
      teamKey: r.teamKey ? String(r.teamKey).trim() || null : null,
    }));
}

async function extractSponsorsFromRows(rawRows) {
  if (rawRows.length > MAX_ROWS) {
    throw Object.assign(new Error(`This file has ${rawRows.length} rows — AI-assisted reading is limited to ${MAX_ROWS} at a time. Try splitting it into smaller files.`), { status: 400 });
  }
  const rows = await callClaude(SPONSOR_PROMPT_HEADER + rowsToText(rawRows), 8000);
  return rows
    .filter((r) => r && typeof r.companyName === "string" && r.companyName.trim())
    .map((r) => ({
      companyName: r.companyName.trim(),
      contactName: typeof r.contactName === "string" ? r.contactName.trim() : "",
      email: typeof r.email === "string" ? r.email.trim() : "",
      phone: typeof r.phone === "string" ? r.phone.trim() : "",
      tierName: typeof r.tierName === "string" ? r.tierName.trim() : "",
      amount: Number.isFinite(Number(r.amount)) && Number(r.amount) > 0 ? Number(r.amount) : null,
    }));
}

module.exports = { extractPlayersFromRows, extractSponsorsFromRows };
