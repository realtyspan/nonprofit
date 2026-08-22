import React, { useEffect, useMemo, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { computeRentalQuote } from "../lib/rentalPricing";
import SignaturePad from "../components/SignaturePad";
import ReceiptField from "../components/ReceiptField";
import DataList from "../components/DataList";
import Modal from "../components/Modal";
import { useIsMobile } from "../lib/viewport";
import { formatPhone, stripPhone } from "../lib/phone";

const HISTORY_STATUSES = ["completed", "declined", "cancelled"];

export default function RentalBookings({ spaces, onChanged }) {
  const isMobile = useIsMobile();
  const [bookings, setBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [signing, setSigning] = useState(null);
  const [uploadingContract, setUploadingContract] = useState(null);
  const [viewingHistory, setViewingHistory] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  function refresh() {
    api.listRentalBookings().then(setBookings).catch(() => {});
  }

  useEffect(refresh, []);

  const inquiries = bookings.filter((b) => b.status === "inquiry");
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const history = bookings.filter((b) => HISTORY_STATUSES.includes(b.status));

  const filteredHistory = useMemo(() => {
    return history.filter((b) => {
      if (historyStatusFilter !== "all" && b.status !== historyStatusFilter) return false;
      if (historySearch && !b.renterName.toLowerCase().includes(historySearch.trim().toLowerCase())) return false;
      const startDate = new Date(b.startAt);
      if (historyFrom && startDate < new Date(historyFrom)) return false;
      if (historyTo && startDate > new Date(`${historyTo}T23:59:59`)) return false;
      return true;
    });
  }, [history, historySearch, historyStatusFilter, historyFrom, historyTo]);

  async function act(fn) {
    try {
      await fn();
      refresh();
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Inquiries {inquiries.length > 0 && <span style={pill(colors.warningBg, colors.warning)}>{inquiries.length} pending</span>}</div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Submitted online or logged by staff — nothing is confirmed until reviewed.</div>
          </div>
          <button style={button.ghost} onClick={() => setShowForm((s) => !s)}>{showForm ? "− Cancel" : "+ Log inquiry"}</button>
        </div>

        {showForm && (
          <BookingForm
            spaces={spaces}
            error={formError}
            onError={setFormError}
            onCreated={() => { setShowForm(false); setFormError(""); refresh(); onChanged(); }}
          />
        )}

        <DataList
          rows={inquiries}
          emptyMessage={showForm ? "" : "No pending inquiries."}
          columns={[
            {
              key: "renter", label: "Renter", grid: "1.4fr", primary: true,
              render: (b) => (
                <>
                  <div style={{ fontWeight: 600 }}>{b.renterName}</div>
                  <div style={{ fontSize: 11.5, color: colors.textTertiary }}>{b.renterEmail}</div>
                </>
              ),
            },
            { key: "space", label: "Space", grid: "1.2fr", render: (b) => b.space?.name },
            { key: "start", label: "Start", grid: "1fr", render: (b) => new Date(b.startAt).toLocaleString() },
            { key: "guests", label: "Guests", grid: "1fr", render: (b) => b.expectedGuests ?? "—" },
            {
              key: "action", label: "", grid: "auto", fullWidthOnMobile: true,
              render: (b) => <button style={button.primary} onClick={() => setReviewing(b)}>Review</button>,
            },
          ]}
        />
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>Confirmed bookings</div>
        <DataList
          rows={confirmed}
          emptyMessage="No confirmed bookings."
          columns={[
            { key: "renter", label: "Renter", grid: "1.3fr", primary: true, render: (b) => b.renterName },
            { key: "space", label: "Space", grid: "1fr", render: (b) => b.space?.name },
            { key: "start", label: "Start", grid: "1fr", render: (b) => new Date(b.startAt).toLocaleDateString() },
            { key: "total", label: "Total", grid: "0.9fr", render: (b) => money(b.quotedTotal) },
            {
              key: "balance", label: "Deposit / Balance", grid: "0.9fr",
              render: (b) => (
                <>
                  <div style={{ fontSize: 11.5, color: colors.textTertiary, marginBottom: 3 }}>{money(b.totalPaid || 0)} / {money(b.quotedTotal || 0)}</div>
                  {b.balanceDue > 0 ? (
                    <span style={pill(colors.warningBg, colors.warning)}>Balance due: {money(b.balanceDue)}</span>
                  ) : (
                    <span style={pill(colors.successBg, colors.success)}>Paid in full{b.balanceDue < 0 ? ` (${money(-b.balanceDue)} credit)` : ""}</span>
                  )}
                </>
              ),
            },
            {
              key: "actions", label: "", grid: "1.6fr", fullWidthOnMobile: true,
              render: (b) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                  <button style={button.ghost} onClick={() => setPaying(b)}>Payment</button>
                  <button style={button.ghost} onClick={() => setSigning(b)}>{b.contractSignatureImage ? "Signed" : "Sign"}</button>
                  <button style={button.ghost} onClick={() => setUploadingContract(b)}>{b.uploadedContractFile ? "Contract uploaded" : "Upload contract"}</button>
                  <button style={button.ghost} onClick={() => api.downloadRentalContractPdf(b.id, b.renterName)}>Contract</button>
                  <button style={button.ghost} onClick={() => act(() => api.completeRentalBooking(b.id))}>Complete</button>
                  <button style={button.ghost} onClick={() => { if (confirm("Cancel this booking?")) act(() => api.cancelRentalBooking(b.id)); }}>Cancel</button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>History</div>
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", flexDirection: isMobile ? "column" : "row", gap: 10, flexWrap: "wrap", padding: "12px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <input style={{ ...inputStyle, width: isMobile ? "100%" : 160 }} placeholder="Search by name" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
          <select style={{ ...inputStyle, width: isMobile ? "100%" : 150 }} value={historyStatusFilter} onChange={(e) => setHistoryStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textSecondary }}>
            From <input style={{ ...inputStyle, width: isMobile ? "100%" : 140 }} type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textSecondary }}>
            To <input style={{ ...inputStyle, width: isMobile ? "100%" : 140 }} type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
          </label>
          {(historySearch || historyStatusFilter !== "all" || historyFrom || historyTo) && (
            <button
              type="button"
              style={{ ...button.ghost, padding: "6px 10px", fontSize: 12 }}
              onClick={() => { setHistorySearch(""); setHistoryStatusFilter("all"); setHistoryFrom(""); setHistoryTo(""); }}
            >
              Clear filters
            </button>
          )}
          <div style={{ marginLeft: isMobile ? 0 : "auto", fontSize: 12, color: colors.textSecondary }}>{filteredHistory.length} of {history.length}</div>
        </div>
        <DataList
          rows={filteredHistory}
          onRowClick={(b) => setViewingHistory(b)}
          emptyMessage={history.length === 0 ? "Nothing here yet." : "No history records match these filters."}
          columns={[
            { key: "renter", label: "Renter", grid: "1.3fr", primary: true, render: (b) => b.renterName },
            { key: "space", label: "Space", grid: "1fr", render: (b) => b.space?.name },
            { key: "date", label: "Date", grid: "1fr", render: (b) => new Date(b.startAt).toLocaleDateString() },
            { key: "status", label: "Status", grid: "1fr", render: (b) => <span style={{ textTransform: "capitalize", color: colors.textSecondary }}>{b.status}</span> },
          ]}
        />
      </div>

      {reviewing && (
        <ReviewModal
          booking={reviewing}
          onCancel={() => setReviewing(null)}
          onDone={() => { setReviewing(null); refresh(); onChanged(); }}
        />
      )}
      {paying && (
        <PaymentModal booking={paying} onCancel={() => setPaying(null)} onSaved={() => { setPaying(null); refresh(); }} />
      )}
      {signing && (
        <SignModal booking={signing} onCancel={() => setSigning(null)} onSaved={() => { setSigning(null); refresh(); }} />
      )}
      {uploadingContract && (
        <UploadContractModal booking={uploadingContract} onCancel={() => setUploadingContract(null)} onSaved={() => { setUploadingContract(null); refresh(); }} />
      )}
      {viewingHistory && (
        <HistoryDetailModal booking={viewingHistory} onCancel={() => setViewingHistory(null)} onChanged={() => { setViewingHistory(null); refresh(); onChanged(); }} />
      )}
    </div>
  );
}

function ReviewModal({ booking, onCancel, onDone }) {
  const [deposit, setDeposit] = useState(booking.space?.depositAmount ?? 0);
  const [declineReason, setDeclineReason] = useState("");
  const [wantsBartender, setWantsBartender] = useState(booking.wantsBartender || false);
  const [wantsLinen, setWantsLinen] = useState(booking.wantsLinen || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const quote = computeRentalQuote(booking.space, { ...booking, wantsBartender, wantsLinen });

  async function confirm() {
    setError("");
    setBusy(true);
    try {
      if (wantsBartender !== booking.wantsBartender || wantsLinen !== booking.wantsLinen) {
        await api.updateRentalBooking(booking.id, { wantsBartender, wantsLinen });
      }
      await api.confirmRentalBooking(booking.id, { depositAmount: Number(deposit) });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setError("");
    setBusy(true);
    try {
      await api.declineRentalBooking(booking.id, declineReason);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={460}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{booking.renterName}</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 14 }}>
          {booking.space?.name} · {new Date(booking.startAt).toLocaleString()} – {new Date(booking.endAt).toLocaleTimeString()}
        </div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 14 }}>
          {booking.renterEmail} {booking.renterPhone && `· ${formatPhone(booking.renterPhone)}`}<br />
          {booking.eventType && `${booking.eventType} · `}{booking.expectedGuests ?? "—"} guests · {booking.isMember ? "Member" : "Non-member"} rate
        </div>

        {booking.space?.offersBartender && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={wantsBartender} onChange={(e) => setWantsBartender(e.target.checked)} />
            Add bartender service
          </label>
        )}

        {booking.space?.offersLinen && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={wantsLinen} onChange={(e) => setWantsLinen(e.target.checked)} />
            Add linen service
          </label>
        )}

        {quote && (
          <div style={{ background: "#fafafa", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginBottom: 14 }}>
            <Row label="Space" value={money(quote.spaceCost)} />
            {wantsBartender && <Row label="Bartender" value={money(quote.bartenderCost)} />}
            {wantsLinen && <Row label="Linen" value={money(quote.linenCost)} />}
            {quote.equipmentCost > 0 && <Row label="Equipment / kitchen" value={money(quote.equipmentCost)} />}
            <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Total</span>
              <span>{money(quote.total)}</span>
            </div>
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "#52525b", marginBottom: 14 }}>
          Deposit to collect
          <input style={inputStyle} type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "#52525b", marginBottom: 14 }}>
          Decline reason (only needed if declining)
          <input style={inputStyle} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Date already booked" />
        </label>

        {error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <button style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...button.ghost, color: colors.danger }} onClick={decline} disabled={busy}>Decline</button>
            <button style={button.primary} onClick={confirm} disabled={busy}>Approve & confirm</button>
          </div>
        </div>
    </Modal>
  );
}

function PaymentModal({ booking, onCancel, onSaved }) {
  const [payments, setPayments] = useState([]);
  const [totalPaid, setTotalPaid] = useState(booking.totalPaid || 0);
  const [totalAdjustments, setTotalAdjustments] = useState(booking.totalAdjustments || 0);
  const [balanceDue, setBalanceDue] = useState(booking.balanceDue ?? booking.quotedTotal ?? 0);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("payment");
  const [method, setMethod] = useState("cash");
  const [receiptNum, setReceiptNum] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    api.listRentalPayments(booking.id).then(setPayments).catch(() => {});
  }
  useEffect(refresh, [booking.id]);

  // Recompute the header totals from the ledger itself rather than trusting
  // the (possibly stale) booking snapshot passed in — this modal is the one
  // place that changes the ledger, so it should reflect its own edits live.
  useEffect(() => {
    const paid = payments.filter((p) => p.type === "payment").reduce((s, p) => s + p.amount, 0);
    const adj = payments.filter((p) => p.type === "adjustment").reduce((s, p) => s + p.amount, 0);
    setTotalPaid(paid);
    setTotalAdjustments(adj);
    setBalanceDue((booking.quotedTotal || 0) - paid - adj);
  }, [payments, booking.quotedTotal]);

  async function addEntry(e) {
    e.preventDefault();
    setError("");
    const amt = Number(amount);
    if (!(amt > 0)) return setError("Enter an amount greater than $0");
    if (type === "adjustment" && !note.trim()) return setError("A reason is required for an adjustment");
    setBusy(true);
    try {
      await api.addRentalPayment(booking.id, { amount: amt, type, method: type === "payment" ? method : undefined, receiptNum, note });
      setAmount(""); setReceiptNum(""); setNote("");
      refresh();
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id) {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api.deleteRentalPayment(booking.id, id);
      refresh();
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  const isMobile = useIsMobile();

  return (
    <Modal onCancel={onCancel} width={460} title={`Payment — ${booking.renterName}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#fafafa", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <div><div style={{ color: colors.textSecondary, fontSize: 11 }}>Total</div>{money(booking.quotedTotal || 0)}</div>
          <div><div style={{ color: colors.textSecondary, fontSize: 11 }}>Paid so far</div>{money(totalPaid)}</div>
          <div>
            <div style={{ color: colors.textSecondary, fontSize: 11 }}>{balanceDue < 0 ? "Credit" : "Balance due"}</div>
            <span style={{ fontWeight: 700, color: balanceDue > 0 ? colors.warning : colors.success }}>{money(Math.abs(balanceDue))}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflow: "auto" }}>
          {payments.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${colors.borderLight}` }}>
              <div>
                <span style={pill(p.type === "adjustment" ? colors.warningBg : colors.successBg, p.type === "adjustment" ? colors.warning : colors.success)}>
                  {p.type === "adjustment" ? "Adjustment" : "Payment"}
                </span>{" "}
                <span style={{ fontWeight: 700 }}>{money(p.amount)}</span>{" "}
                <span style={{ color: colors.textTertiary }}>
                  {p.type === "payment" ? `${p.method}${p.receiptNum ? ` · #${p.receiptNum}` : ""}` : p.note}
                </span>
                <div style={{ color: colors.textTertiary }}>{new Date(p.recordedAt).toLocaleString()} · {p.recordedByName}</div>
              </div>
              <button type="button" style={{ ...button.ghost, padding: "3px 8px", fontSize: 11 }} onClick={() => removeEntry(p.id)}>Delete</button>
            </div>
          ))}
          {payments.length === 0 && <div style={{ fontSize: 12.5, color: colors.textSecondary }}>No payments recorded yet.</div>}
        </div>

        <form onSubmit={addEntry} style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            <input style={inputStyle} type="number" step="0.01" min="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="payment">Payment</option>
              <option value="adjustment">Adjustment (discount/comp)</option>
            </select>
          </div>
          {type === "payment" ? (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
              <select style={inputStyle} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
              </select>
              <input style={inputStyle} placeholder="Receipt / check # (optional)" value={receiptNum} onChange={(e) => setReceiptNum(e.target.value)} />
            </div>
          ) : (
            <input style={inputStyle} placeholder="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} />
          )}
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
          <button style={button.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Add"}</button>
        </form>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={button.ghost} onClick={onCancel}>Close</button>
        </div>
        </div>
    </Modal>
  );
}

function SignModal({ booking, onCancel, onSaved }) {
  const [name, setName] = useState(booking.contractSignedName || booking.renterName);
  const [signatureImage, setSignatureImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api.signRentalBooking(booking.id, name, signatureImage);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={420} title="Sign contract">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>Hand your device to the renter to sign in the box below. Timestamped and recorded when saved.</div>

        {booking.contractSignatureImage && (
          <div style={{ fontSize: 11.5, color: colors.textTertiary }}>
            Already signed {new Date(booking.contractSignedAt).toLocaleString()} — signing again replaces it.
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#52525b" }}>
          Printed name
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#52525b" }}>
          Signature
          <SignaturePad onChange={setSignatureImage} />
        </label>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={button.ghost} onClick={onCancel}>Cancel</button>
          <button style={button.primary} onClick={save} disabled={busy || !name.trim() || !signatureImage}>{busy ? "Saving…" : "Save signature"}</button>
        </div>
      </div>
    </Modal>
  );
}

// A second, equally valid way to get a signed contract on record — some
// renters prefer a physical paper contract signed in person; staff scans or
// photographs it and attaches it here instead of drawing a signature
// in-app. Independent of SignModal: a booking can have either, both, or
// neither.
function UploadContractModal({ booking, onCancel, onSaved }) {
  const [contractFile, setContractFile] = useState(booking.uploadedContractFile || "");
  const [contractFileName, setContractFileName] = useState(booking.uploadedContractFileName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api.uploadRentalContract(booking.id, { receiptFile: contractFile, receiptFileName: contractFileName });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={420} title="Upload signed contract">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>For a renter who signed a physical paper contract instead — attach a photo or scan as the permanent record.</div>

        {booking.uploadedContractFile && (
          <div style={{ fontSize: 11.5, color: colors.textTertiary }}>
            Already uploaded {new Date(booking.uploadedContractAt).toLocaleString()} — uploading again replaces it.
          </div>
        )}

        <ReceiptField
          label="Signed contract (image or PDF)"
          itemLabel="contract"
          receiptFile={contractFile}
          receiptFileName={contractFileName}
          onChange={({ receiptFile, receiptFileName }) => { setContractFile(receiptFile); setContractFileName(receiptFileName); }}
        />

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={button.ghost} onClick={onCancel}>Cancel</button>
          <button style={button.primary} onClick={save} disabled={busy || !contractFile}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

const RESTORE_LABEL = { cancelled: "confirmed", declined: "an inquiry", completed: "confirmed" };

// View-only look at a completed/declined/cancelled booking's full record —
// nothing about a booking is actually cleared when its status changes, this
// just surfaces what was already there (payments, contract, decline
// reason). Restore undoes a mistaken status change; Delete is only offered
// once nothing real (a payment or a contract) is attached — same
// immutability rule as raffle games: real activity makes a record
// permanent, and Restore is the only way back at that point.
function HistoryDetailModal({ booking, onCancel, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listRentalPayments(booking.id).then(setPayments).catch(() => {});
  }, [booking.id]);

  const hasContract = !!(booking.contractSignatureImage || booking.uploadedContractFile);
  const canDelete = payments.length === 0 && !hasContract;
  const hasCollectedFunds = payments.some((p) => p.type === "payment");

  async function restore() {
    setError("");
    setBusy(true);
    try {
      await api.restoreRentalBooking(booking.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setError("");
    setBusy(true);
    try {
      await api.deleteRentalBooking(booking.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{booking.renterName}</div>
          <span style={pill("#f0f0f3", colors.textSecondary)}>{booking.status}</span>
        </div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
          {booking.space?.name} · {new Date(booking.startAt).toLocaleString()} – {new Date(booking.endAt).toLocaleTimeString()}
        </div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
          {booking.renterEmail} {booking.renterPhone && `· ${formatPhone(booking.renterPhone)}`}<br />
          {booking.renterAddress && <>{booking.renterAddress}<br /></>}
          {booking.eventType && `${booking.eventType} · `}{booking.expectedGuests ?? "—"} guests · {booking.isMember ? "Member" : "Non-member"} rate
        </div>

        {booking.status === "declined" && booking.declineReason && (
          <div style={{ background: colors.warningBg, color: colors.warning, borderRadius: 8, padding: 10, fontSize: 12.5 }}>
            Declined: {booking.declineReason}
          </div>
        )}

        {booking.quotedTotal != null && (
          <div style={{ background: "#fafafa", borderRadius: 10, padding: 12, fontSize: 13 }}>
            <Row label="Quoted total" value={money(booking.quotedTotal)} />
            <Row label="Paid" value={money(booking.totalPaid || 0)} />
            <Row label="Balance" value={money(booking.balanceDue ?? booking.quotedTotal)} />
          </div>
        )}

        {payments.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: colors.textSecondary, marginBottom: 6 }}>Payment history</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {payments.map((p) => (
                <div key={p.id} style={{ fontSize: 12.5, color: colors.textSecondary }}>
                  {p.type === "adjustment" ? "Adjustment" : "Payment"} · {money(p.amount)} · {new Date(p.recordedAt).toLocaleDateString()}
                  {p.type === "payment" ? ` · ${p.method}` : ` · ${p.note}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasContract && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: colors.textSecondary, marginBottom: 6 }}>Contract</div>
            {booking.contractSignatureImage && (
              <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 4 }}>
                Signed in-app by {booking.contractSignedName} — {new Date(booking.contractSignedAt).toLocaleString()}
              </div>
            )}
            {booking.uploadedContractFile && (
              <a href={booking.uploadedContractFile} download={booking.uploadedContractFileName || "contract"} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: colors.accent, fontWeight: 600 }}>
                📄 Uploaded contract — {new Date(booking.uploadedContractAt).toLocaleString()}
              </a>
            )}
          </div>
        )}

        {booking.notes && (
          <div style={{ fontSize: 12.5, color: colors.textSecondary }}><strong>Notes:</strong> {booking.notes}</div>
        )}

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={button.ghost} disabled={busy} onClick={restore}>
            {busy ? "Restoring…" : `Restore to ${RESTORE_LABEL[booking.status]}`}
          </button>
          {!confirmDelete ? (
            canDelete ? (
              <button style={{ ...button.ghost, color: colors.danger }} onClick={() => setConfirmDelete(true)}>Delete permanently</button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11.5, color: colors.textTertiary }}>
                  {payments.length > 0 && hasContract
                    ? "Can't be deleted — this booking has payment records and a contract attached. Remove the payment(s) from the Payment screen first (a contract can't be removed) — or restore it instead if it was cancelled/declined/completed by mistake."
                    : payments.length > 0
                    ? "Can't be deleted — this booking has payment records attached. Remove the payment(s) from the Payment screen first, then this can be deleted — or restore it instead if it was cancelled/declined/completed by mistake."
                    : "Can't be deleted — this booking has a signed or uploaded contract attached. Restore it instead if it was cancelled/declined/completed by mistake."}
                </div>
                {hasCollectedFunds && (
                  <div style={{ fontSize: 11.5, color: colors.danger, background: colors.dangerBg, borderRadius: 6, padding: 8 }}>
                    Cash or a check has already been collected against this booking. Removing that payment record here affects your financial records for this booking — make sure that's accounted for before removing it.
                  </div>
                )}
              </div>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Delete this booking permanently? This can't be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={button.ghost} onClick={() => setConfirmDelete(false)}>Never mind</button>
                <button style={{ ...button.primary, background: colors.danger }} disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete permanently"}</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={button.ghost} onClick={onCancel}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function BookingForm({ spaces, onCreated, onError, error }) {
  const [form, setForm] = useState({
    spaceId: spaces[0]?.id || "", renterName: "", renterEmail: "", renterPhone: "", renterAddress: "",
    isMember: false, eventType: "", expectedGuests: "", startAt: "", endAt: "",
    wantsBartender: false, wantsLinen: false, roundTables: "", longTables: "", chairs: "", kitchenUse: "", chafingDishes: "", notes: "",
  });
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    onError("");
    setBusy(true);
    try {
      await api.createRentalBooking(form);
      onCreated();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const space = spaces.find((s) => s.id === form.spaceId);

  return (
    <form onSubmit={submit} style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}`, background: "#fafafa", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Renter name"><input style={inputStyle} required value={form.renterName} onChange={(e) => set("renterName", e.target.value)} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" required value={form.renterEmail} onChange={(e) => set("renterEmail", e.target.value)} /></Field>
        <Field label="Phone"><input style={inputStyle} value={formatPhone(form.renterPhone)} onChange={(e) => set("renterPhone", stripPhone(e.target.value))} /></Field>
        <Field label="Club member?">
          <select style={inputStyle} value={form.isMember ? "yes" : "no"} onChange={(e) => set("isMember", e.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Space">
          <select style={inputStyle} value={form.spaceId} onChange={(e) => set("spaceId", e.target.value)}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Event type"><input style={inputStyle} value={form.eventType} onChange={(e) => set("eventType", e.target.value)} /></Field>
        <Field label="Expected guests"><input style={inputStyle} type="number" min="0" value={form.expectedGuests} onChange={(e) => set("expectedGuests", e.target.value)} /></Field>
        <Field label="Address"><input style={inputStyle} value={form.renterAddress} onChange={(e) => set("renterAddress", e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Start"><input style={inputStyle} type="datetime-local" required value={form.startAt} onChange={(e) => set("startAt", e.target.value)} /></Field>
        <Field label="End"><input style={inputStyle} type="datetime-local" required value={form.endAt} onChange={(e) => set("endAt", e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {space?.offersBartender && (
          <Field label="Bartender?">
            <select style={inputStyle} value={form.wantsBartender ? "yes" : "no"} onChange={(e) => set("wantsBartender", e.target.value === "yes")}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        )}
        {space?.offersLinen && (
          <Field label="Linen?">
            <select style={inputStyle} value={form.wantsLinen ? "yes" : "no"} onChange={(e) => set("wantsLinen", e.target.value === "yes")}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        )}
        <Field label="Round tables"><input style={inputStyle} type="number" min="0" value={form.roundTables} onChange={(e) => set("roundTables", e.target.value)} /></Field>
        <Field label="8' tables"><input style={inputStyle} type="number" min="0" value={form.longTables} onChange={(e) => set("longTables", e.target.value)} /></Field>
        <Field label="Chairs"><input style={inputStyle} type="number" min="0" value={form.chairs} onChange={(e) => set("chairs", e.target.value)} /></Field>
        <Field label="Kitchen">
          <select style={inputStyle} value={form.kitchenUse} onChange={(e) => set("kitchenUse", e.target.value)}>
            <option value="">None</option>
            <option value="no_oven">No oven</option>
            <option value="with_oven">With oven</option>
          </select>
        </Field>
        <Field label="Chafing dishes"><input style={inputStyle} type="number" min="0" value={form.chafingDishes} onChange={(e) => set("chafingDishes", e.target.value)} /></Field>
      </div>
      <Field label="Notes"><input style={inputStyle} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={button.primary} type="submit" disabled={busy || !form.spaceId}>{busy ? "Saving…" : "Log inquiry"}</button>
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: colors.textSecondary }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
