const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const TEMPLATE_PATH = path.join(__dirname, "../../templates/gc7q_0824.pdf");

// Exact field names read off the real NYS GC-7Q form (gc7q_0824.pdf) AcroForm.
// Most fields are unhelpfully auto-named ("undefined", "Text14") by whatever tool
// produced this PDF, so the mapping below was derived by cross-referencing each
// field's page position against the form's visual line order (A1-D17, then the
// three affirmation blocks) rather than by name alone.
//
// Note: the quarter checkboxes at the top of page 1 are NOT real form fields (no
// Btn/checkbox annotations exist on the page at all) — there is no fillable way to
// mark them. The filer must hand-check the correct quarter box after printing.
// The three "Signature" fields are real PDFSignature fields, not text — they can't
// be filled with a typed name; a real signature still has to be added by hand or
// via a proper e-sign flow. Date/Print Name/Print Title/Home Address/Phone/Email
// are all populated from the signer's own profile (see auth.js /me).

const FIELDS = {
  year: "CALENDAR YEAR",
  orgName: "Name of Organization",
  gcId: "Games of Chance ID",
  street: "Text1",
  city: "Text2",
  zip: "Zip Code",

  A1: "Text3",
  A2: "undefined",
  A3: "undefined_2",
  A4: "undefined_3",
  A5: "A5  Cost of deals coin boards andor merchandise boards purchased this quarter only",
  A6: "undefined_4",
  A7: "undefined_5",
  B8: "undefined_6",
  B9: "undefined_7",
  C10: "undefined_8",
  C11: "undefined_9",
  C12: "undefined_10",
  C13: "C13 Adjustments needs prior approval from the Gaming Commission before including it on this form",
  adjustmentExplanation: "Adjustment Explanation",
  C14: "undefined_11",
  C15: "undefined_12",
  D16: "undefined_13",
  D17: "undefined_14",

  head: { date: "Date", printName: "Print Name", printTitle: "Print Title", homeAddress: "Home Address City and Zip Code", phone: "Phone Number", email: "Email Address" },
  preparer: { date: "Date_2", printName: "Text6", printTitle: "Text7", homeAddress: "Text8", phone: "Phone Number_2", email: "Text9" },
  member: { date: "Date_3", printName: "Text11", printTitle: "Text14", homeAddress: "Text12", phone: "Phone Number_3", email: "Text13" },
};

function num(n) {
  return Number(n || 0).toFixed(2);
}

function set(form, fieldName, value) {
  try {
    form.getTextField(fieldName).setText(String(value ?? ""));
  } catch {
    // Field not present / not a text field (e.g. the Signature widgets) — skip.
  }
}

// header: { year, orgName, gcId, street, city, zip }
// values: computeGC7Q() output (A1-D17)
// signOffs: { head: { name, email, signedAt, title, phone, homeAddress }, preparer: {...}, member: {...} } — any may be absent
async function fillGC7QPdf({ header, values, signOffs = {} }) {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();

  set(form, FIELDS.year, header.year);
  set(form, FIELDS.orgName, header.orgName);
  set(form, FIELDS.gcId, header.gcId);
  set(form, FIELDS.street, header.street);
  set(form, FIELDS.city, header.city);
  set(form, FIELDS.zip, header.zip);

  set(form, FIELDS.A1, values.A1);
  set(form, FIELDS.A2, num(values.A2));
  set(form, FIELDS.A3, num(values.A3));
  set(form, FIELDS.A4, num(values.A4));
  set(form, FIELDS.A5, num(values.A5));
  set(form, FIELDS.A6, num(values.A6));
  set(form, FIELDS.A7, num(values.A7));
  set(form, FIELDS.B8, num(values.B8));
  set(form, FIELDS.B9, num(values.B9));
  set(form, FIELDS.C10, num(values.C10));
  set(form, FIELDS.C11, num(values.C11));
  set(form, FIELDS.C12, num(values.C12));
  set(form, FIELDS.C13, num(values.C13));
  set(form, FIELDS.adjustmentExplanation, header.adjustmentExplanation || "");
  set(form, FIELDS.C14, num(values.C14));
  set(form, FIELDS.C15, num(values.C15));
  set(form, FIELDS.D16, num(values.D16));
  set(form, FIELDS.D17, num(values.D17));

  for (const slot of ["head", "preparer", "member"]) {
    const info = signOffs[slot];
    const f = FIELDS[slot];
    if (!info) continue;
    set(form, f.date, info.signedAt ? new Date(info.signedAt).toLocaleDateString() : "");
    set(form, f.printName, info.name || "");
    set(form, f.printTitle, info.title || "");
    set(form, f.homeAddress, info.homeAddress || "");
    set(form, f.phone, info.phone || "");
    set(form, f.email, info.email || "");
  }

  return pdf.save();
}

module.exports = { fillGC7QPdf };
