// Uses Claude's vision API to read a photographed Bell Jar game label/flare
// and pre-fill the "log new game" form — the printed label already carries
// every field this app tracks (name, form #, serial #, ticket count/price,
// ideal payout), so a photo is faster and less error-prone than retyping it.
// The result only ever pre-fills the form; the user reviews and can correct
// any field before saving, so an imperfect read here is not a data-integrity
// risk the way a wrong hand-typed number silently would be.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const EXTRACTION_PROMPT = `This is a photo of a NYS "Bell Jar" / Games of Chance game label (the printed flare/label on the game's box or ticket dispenser). Read the following fields off the label:

- name: the game's name/title
- formNum: the form number (often labeled "Form #" or "Form No.")
- serialNum: the serial number (often labeled "Serial #" or "Serial No.")
- ticketCount: total number of tickets in the deal (an integer)
- ticketPrice: price per ticket in dollars (a number, e.g. 1 or 0.5)
- idealPayout: the ideal/total payout amount in dollars (a number)

Respond with ONLY a single JSON object with exactly these six keys, no other text. Use null for any field you cannot read confidently. Numbers must be plain numbers, not strings or currency-formatted.`;

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

async function scanGameLabel(imageDataUrl) {
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
      model: "claude-haiku-4-5",
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
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("Label scan returned no text content");
  return extractJson(textBlock.text);
}

module.exports = { scanGameLabel };
