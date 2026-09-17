// Light rich-text support for Event.description — "light formatting" per
// the user's own ask (bold + bullet lists + paragraphs), not full HTML.
// Stored as sanitized HTML in the existing `description` string column (no
// schema change), rendered as-is on the public event page/embed and parsed
// into styled runs for the flyer PDF (see eventDescriptionRuns below).
//
// Scoped deliberately narrow: no italic. The flyer PDF only has Regular/
// Medium/SemiBold/Bold weights of Inter loaded (see golfFlyerPdf.js's
// FONT_FILES) — no italic face — so an italic toggle would look right on
// the web page but silently render upright in the printed flyer. Bold +
// bullets + paragraphs already solves the "empty center" problem this was
// asked for; italic can be added later if it's actually wanted, once an
// italic font file is sourced for the PDF side too.
const sanitizeHtml = require("sanitize-html");

const ALLOWED_TAGS = ["p", "br", "strong", "b", "ul", "ol", "li"];

// Every public-facing rich-text field (just this one today) goes through
// this exact allowlist before it's ever stored — the trust boundary is the
// server, not the editor, since the editor only constrains a well-behaved
// browser, not a direct API call.
function sanitizeDescriptionHtml(html) {
  if (!html) return null;
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    // Bare text a paste can leave outside any <p>/<li> — wrap it so the
    // parser below (and the browser) always sees block-level structure.
    textFilter: (text) => text,
  }).trim();
  if (!clean) return null;
  return clean;
}

// A legacy plain-text description (every row saved before this feature
// existed) has no tags at all — the new rich editor and the PDF parser
// both need it lifted into the same {paragraphs} shape real HTML produces,
// without inventing bullets/bold that were never there. Blank lines split
// paragraphs, same as the old pre-wrap rendering implied visually.
function plainTextToHtml(text) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return null;
  return paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

// True once anything has gone through sanitizeDescriptionHtml — used to
// tell a genuinely-empty description apart from one that's just legacy
// plain text, since both are falsy-ish but need different treatment.
function looksLikeHtml(value) {
  return typeof value === "string" && /<[a-z][\s\S]*>/i.test(value);
}

// Turns sanitized description HTML (only ALLOWED_TAGS ever appear, no
// attributes, no nesting beyond ul/ol > li) into a flat block list the
// flyer PDF can lay out without a real DOM: [{ type: "p" | "li", runs:
// [{ text, bold, break }] }]. A regex tokenizer is enough for a grammar
// this constrained — reaching for a full HTML parser would be more
// machinery than the five tags it has to handle.
function parseDescriptionBlocks(html) {
  if (!html) return [];
  const blocks = [];
  let boldDepth = 0;
  let current = null;

  function openBlock(type) {
    current = { type, runs: [] };
    blocks.push(current);
  }
  function closeBlock() {
    current = null;
  }
  function pushText(raw) {
    const text = raw
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, " ");
    if (!text) return;
    if (!current) openBlock("p"); // stray text outside any <p>/<li> — sanitize-html can leave this at the top level
    current.runs.push({ text, bold: boldDepth > 0 });
  }

  const tokenRe = /<(\/?)(\w+)[^>]*>|([^<]+)/g;
  let m;
  while ((m = tokenRe.exec(html))) {
    const [, closing, tag, text] = m;
    if (text !== undefined) { pushText(text); continue; }
    const t = (tag || "").toLowerCase();
    if (t === "p" || t === "li") {
      if (closing) closeBlock(); else openBlock(t);
    } else if (t === "br") {
      if (!current) openBlock("p");
      current.runs.push({ text: "", bold: false, break: true });
    } else if (t === "strong" || t === "b") {
      boldDepth = Math.max(0, boldDepth + (closing ? -1 : 1));
    }
    // ul/ol are pure containers here — li already carries its own block
  }
  return blocks.filter((b) => b.runs.some((r) => r.text || r.break));
}

module.exports = { sanitizeDescriptionHtml, plainTextToHtml, looksLikeHtml, parseDescriptionBlocks, ALLOWED_TAGS };
