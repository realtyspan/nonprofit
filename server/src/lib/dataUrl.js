// Decodes a "data:<mime>;base64,<...>" string into a raw Buffer, or null if
// it isn't one. Shared by anything that accepts a client-uploaded image/file
// as a data URL — the historical-import file upload (golf.js) and the
// tournament flyer's hero photo (golfFlyerPdf.js) both go through this.
function decodeDataUrl(dataUrl) {
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

module.exports = { decodeDataUrl };
