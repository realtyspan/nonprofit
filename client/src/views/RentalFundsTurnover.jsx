import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import DataList from "../components/DataList";

// Cross-booking manifest of every collected payment not yet handed off to
// whoever banks it (e.g. the lodge secretary) — the thing a collector uses
// instead of digging through bookings one at a time to remember what they're
// carrying. See RentalPayment.turnedOverAt's schema comment. The funds
// contact card below is the piece that reaches someone who isn't a Charity
// Pulse user at all — see Organization.rentalsFundsContactEmail.
export default function RentalFundsTurnover({ permissions }) {
  const isRentalsAdmin = permissions?.moduleGrants?.rentals === "Admin";
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [turnoverName, setTurnoverName] = useState("");
  const [error, setError] = useState("");

  const [contactEmail, setContactEmail] = useState("");
  const [savedContactEmail, setSavedContactEmail] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  function refresh() {
    api.listRentalFundsToTurnOver().then(setRows).catch(() => {}).finally(() => setLoaded(true));
  }
  useEffect(refresh, []);

  useEffect(() => {
    if (!isRentalsAdmin) return;
    api.getRentalSettings().then((s) => {
      setContactEmail(s.rentalsFundsContactEmail || "");
      setSavedContactEmail(s.rentalsFundsContactEmail || "");
    }).catch(() => {});
  }, [isRentalsAdmin]);

  async function saveContact() {
    setSavingContact(true);
    setContactSaved(false);
    setError("");
    try {
      const trimmed = contactEmail.trim();
      await api.updateRentalSettings({ rentalsFundsContactEmail: trimmed || null });
      setSavedContactEmail(trimmed);
      setContactSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingContact(false);
    }
  }

  async function confirmTurnover(row) {
    if (!turnoverName.trim()) return setError("Enter who received the funds");
    setError("");
    try {
      await api.toggleRentalPaymentTurnedOver(row.bookingId, row.id, { turnedOverToName: turnoverName.trim() });
      setMarkingId(null);
      setTurnoverName("");
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);

  const columns = [
    {
      key: "renter", label: "Renter", grid: "1.3fr", primary: true,
      render: (r) => (
        <>
          <div style={{ fontWeight: 600 }}>{r.renterName}</div>
          <div style={{ fontSize: 11.5, color: colors.textTertiary }}>{r.spaceName} · {new Date(r.startAt).toLocaleDateString()}</div>
        </>
      ),
    },
    { key: "amount", label: "Amount", grid: "0.8fr", render: (r) => <span style={{ fontWeight: 700 }}>{money(r.amount)}</span> },
    { key: "method", label: "Method", grid: "0.9fr", render: (r) => `${r.method}${r.receiptNum ? ` · #${r.receiptNum}` : ""}` },
    {
      key: "collected", label: "Collected", grid: "1.1fr",
      render: (r) => <span style={{ fontSize: 12, color: colors.textSecondary }}>{r.recordedByName || "—"} · {new Date(r.recordedAt).toLocaleDateString()}</span>,
    },
  ];

  if (isRentalsAdmin) {
    columns.push({
      key: "action", label: "", footerRow: true,
      render: (r) => (
        markingId === r.id ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              style={{ ...inputStyle, width: 220, padding: "6px 8px", fontSize: 12.5 }}
              placeholder="Received by (e.g. Secretary name)"
              value={turnoverName}
              onChange={(e) => setTurnoverName(e.target.value)}
              autoFocus
            />
            <button style={{ ...button.primary, padding: "6px 12px", fontSize: 12 }} onClick={() => confirmTurnover(r)}>Confirm</button>
            <button style={{ ...button.ghost, padding: "6px 12px", fontSize: 12 }} onClick={() => { setMarkingId(null); setTurnoverName(""); setError(""); }}>Cancel</button>
          </div>
        ) : (
          <button style={button.ghost} onClick={() => { setMarkingId(r.id); setTurnoverName(""); }}>Mark turned over</button>
        )
      ),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isRentalsAdmin && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Funds contact</div>
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
            Optional — an email to notify whenever a payment is collected, whether or not that person has a Charity Pulse login (e.g. a lodge secretary who only ever handles cash by hand). Anyone with Rentals Admin/Helper access already gets this alert automatically.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...inputStyle, maxWidth: 320 }}
              type="email"
              placeholder="secretary@example.org"
              value={contactEmail}
              onChange={(e) => { setContactEmail(e.target.value); setContactSaved(false); }}
            />
            <button style={button.primary} disabled={savingContact || contactEmail.trim() === savedContactEmail} onClick={saveContact}>
              {savingContact ? "Saving…" : "Save"}
            </button>
            {contactSaved && <span style={{ fontSize: 12, color: colors.success }}>Saved</span>}
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              Funds to turn over {rows.length > 0 && <span style={pill(colors.warningBg, colors.warning)}>{rows.length} pending</span>}
            </div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Every payment collected and not yet handed off, across all bookings.</div>
          </div>
          {rows.length > 0 && <div style={{ fontSize: 13, fontWeight: 700 }}>{money(total)} total</div>}
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 12.5, padding: "10px 18px 0 18px" }}>{error}</div>}

        <DataList
          rows={rows}
          emptyMessage={loaded ? "Nothing awaiting turnover — everything collected has been handed off." : ""}
          columns={columns}
        />
      </div>
    </div>
  );
}
