// Uses Claude's vision API to read a photographed Bell Jar game label/flare
// and pre-fill the "log new game" form — the printed label already carries
// every field this app tracks (name, form #, serial #, ticket count/price,
// ideal payout), so a photo is faster and less error-prone than retyping it.
// The result only ever pre-fills the form; the user reviews and can correct
// any field before saving, so an imperfect read here is not a data-integrity
// risk the way a wrong hand-typed number silently would be.

const { logAiUsage } = require("./aiUsage");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5";

const EXTRACTION_PROMPT = `This is a photo of a NYS "Bell Jar" / Games of Chance game label — either the game's printed flare, or the manufacturer's case/carton label (which is dense with barcodes and abbreviated codes rather than plain-English field names). Read the following fields:

- name: the game's name/title, if printed anywhere on the label.
- formNum: the form/part number.
  - Many manufacturer case labels print a header row reading something like "MFG. ID  PART NBR  SERIES NBR", with three space-separated values on the data row directly below it — e.g. a row reading "UM UNWS3720 F068378" means MFG. ID = "UM", PART NBR = "UNWS3720", SERIES NBR = "F068378". In that case, formNum is the PART NBR value — the SECOND of those three tokens (e.g. "UNWS3720"). Do NOT use the SERIES NBR value (the third token) for this field.
  - If there's no such header row, look instead for text explicitly labeled "Form #" or "Form No.".
- serialNum: the serial number.
  - On the same "MFG. ID / PART NBR / SERIES NBR" data row described above, serialNum is the SERIES NBR value — the THIRD token on that row (e.g. "F068378"). This exact value is often ALSO reprinted much larger and bolder elsewhere on the label as a human-readable callout for quick reference — that's the same serial number, just enlarged, and confirms the reading; use it if the small version is hard to read.
  - Ignore any barcode printed next to a literal "SERIAL#" label — that barcode has no printed digits of its own and is not what this field means here; the real serial number is the SERIES NBR value described above.
  - If there's no "MFG. ID / PART NBR / SERIES NBR" row at all, look instead for text explicitly labeled "Serial #" or "Serial No." with printed digits next to it, and use null only if no printed digits exist anywhere.
- ticketCount: total number of tickets in the deal (an integer). Often labeled "TCNT".
- ticketPrice: price per ticket in dollars (a number, e.g. 1 or 0.5).
  - Manufacturer case labels typically have a row showing the ticket color, then the ticket price, then a profit figure — e.g. a row reading "RED   1   PROFIT: $815/22%" means the ticket price is 1 (i.e. $1.00). That plain number between the color and "PROFIT" IS the ticket price even though it has no dollar sign or label next to it — read it directly, don't leave this null just because it isn't explicitly labeled.
- idealPayout: the total amount that should be paid out in prizes if every ticket in the deal sells. This is NOT the same as a printed "profit" figure — profit and payout are different numbers.
  - If the label directly states a total ideal payout, net payout, or total prize amount, use that number.
  - If instead the label only shows a color/price/profit row like "RED   1   PROFIT: $815/22%", compute idealPayout yourself from the ticket price and profit dollars on that row together with ticketCount: idealPayout = (ticketCount × ticketPrice) − profit dollars. For example, ticketCount 3720, ticketPrice 1, profit $815 gives idealPayout = 3720×1 − 815 = 2905. Do NOT return the profit dollar figure itself as idealPayout, and don't leave idealPayout null just because it isn't printed directly — compute it from the other fields whenever a profit figure is present.

Respond with ONLY a single JSON object with exactly these six keys: name, formNum, serialNum, ticketCount, ticketPrice, idealPayout. Use null for any field you cannot determine confidently. Numbers must be plain numbers, not strings or currency-formatted.`;

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Invalid image data");
  return { mediaType: match[1], base64: match[2] };
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Label scan did not return recognizable JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function scanGameLabel(imageDataUrl, orgId) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("AI label scanning isn't configured for this deployment (missing ANTHROPIC_API_KEY)");
  }
  const { mediaType, base64 } = parseDataUrl(imageDataUrl);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Label scan failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  // Logged as soon as we know tokens were actually spent — even if the JSON
  // extraction below then fails, the org still incurred this call's cost.
  await logAiUsage({
    orgId, feature: "bell-jar-label-scan", model: MODEL,
    inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens,
  });
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("Label scan returned no text content");
  return extractJson(textBlock.text);
}

module.exports = { scanGameLabel };
