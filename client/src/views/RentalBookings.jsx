import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { computeRentalQuote } from "../lib/rentalPricing";
import SignaturePad from "../components/SignaturePad";

const HISTORY_STATUSES = ["completed", "declined", "cancelled"];

export default function RentalBookings({ spaces, onChanged }) {
  const [bookings, setBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [signing, setSigning] = useState(null);

  function refresh() {
    api.listRentalBookings().then(setBookings).catch(() => {});
  }

  useEffect(refresh, []);

  const inquiries = bookings.filter((b) => b.status === "inquiry");
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const history = bookings.filter((b) => HISTORY_STATUSES.includes(b.status));

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

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr auto", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Renter</div>
          <div>Space</div>
          <div>Start</div>
          <div>Guests</div>
          <div></div>
        </div>
        {inquiries.map((b) => (
          <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr auto", padding: "12px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{b.renterName}</div>
              <div style={{ fontSize: 11.5, color: colors.textTertiary }}>{b.renterEmail}</div>
            </div>
            <div>{b.space?.name}</div>
            <div>{new Date(b.startAt).toLocaleString()}</div>
            <div>{b.expectedGuests ?? "—"}</div>
            <button style={button.primary} onClick={() => setReviewing(b)}>Review</button>
          </div>
        ))}
        {inquiries.length === 0 && !showForm && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No pending inquiries.</div>}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>Confirmed bookings</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr 0.9fr 1.6fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Renter</div>
          <div>Space</div>
          <div>Start</div>
          <div>Total</div>
          <div>Deposit / Balance</div>
          <div></div>
        </div>
        {confirmed.map((b) => (
          <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr 0.9fr 1.6fr", padding: "12px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{b.renterName}</div>
            <div>{b.space?.name}</div>
            <div>{new Date(b.startAt).toLocaleDateString()}</div>
            <div>{money(b.quotedTotal)}</div>
            <div>
              <span style={pill(b.depositPaid ? colors.successBg : colors.warningBg, b.depositPaid ? colors.success : colors.warning)}>{b.depositPaid ? "Deposit ✓" : "Deposit due"}</span>{" "}
              <span style={pill(b.balancePaid ? colors.successBg : "#f0f0f3", b.balancePaid ? colors.success : colors.textSecondary)}>{b.balancePaid ? "Balance ✓" : "Balance due"}</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button style={button.ghost} onClick={() => setPaying(b)}>Payment</button>
              <button style={button.ghost} onClick={() => setSigning(b)}>{b.contractSignatureImage ? "Signed" : "Sign"}</button>
              <button style={button.ghost} onClick={() => api.downloadRentalContractPdf(b.id, b.renterName)}>Contract</button>
              <button style={button.ghost} onClick={() => act(() => api.completeRentalBooking(b.id))}>Complete</button>
              <button style={button.ghost} onClick={() => { if (confirm("Cancel this booking?")) act(() => api.cancelRentalBooking(b.id)); }}>Cancel</button>
            </div>
          </div>
        ))}
        {confirmed.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No confirmed bookings.</div>}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>History</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Renter</div>
          <div>Space</div>
          <div>Date</div>
          <div>Status</div>
        </div>
        {history.map((b) => (
          <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13 }}>
            <div>{b.renterName}</div>
            <div>{b.space?.name}</div>
            <div>{new Date(b.startAt).toLocaleDateString()}</div>
            <div style={{ textTransform: "capitalize", color: colors.textSecondary }}>{b.status}</div>
          </div>
        ))}
        {history.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>Nothing here yet.</div>}
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
    </div>
  );
}

function ReviewModal({ booking, onCancel, onDone }) {
  const [deposit, setDeposit] = useState(booking.space?.depositAmount ?? 0);
  const [declineReason, setDeclineReason] = useState("");
  const [wantsBartender, setWantsBartender] = useState(booking.wantsBartender || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const quote = computeRentalQuote(booking.space, { ...booking, wantsBartender });

  async function confirm() {
    setError("");
    setBusy(true);
    try {
      if (wantsBartender !== booking.wantsBartender) {
        await api.updateRentalBooking(booking.id, { wantsBartender });
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 460, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{booking.renterName}</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 14 }}>
          {booking.space?.name} · {new Date(booking.startAt).toLocaleString()} – {new Date(booking.endAt).toLocaleTimeString()}
        </div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 14 }}>
          {booking.renterEmail} {booking.renterPhone && `· ${booking.renterPhone}`}<br />
          {booking.eventType && `${booking.eventType} · `}{booking.expectedGuests ?? "—"} guests · {booking.isMember ? "Member" : "Non-member"} rate
        </div>

        {booking.space?.offersBartender && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={wantsBartender} onChange={(e) => setWantsBartender(e.target.checked)} />
            Add bartender service
          </label>
        )}

        {quote && (
          <div style={{ background: "#fafafa", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginBottom: 14 }}>
            <Row label="Space" value={money(quote.spaceCost)} />
            {wantsBartender && <Row label="Bartender" value={money(quote.bartenderCost)} />}
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
      </div>
    </div>
  );
}

function PaymentModal({ booking, onCancel, onSaved }) {
  const [depositPaid, setDepositPaid] = useState(booking.depositPaid);
  const [depositMethod, setDepositMethod] = useState(booking.depositMethod || "cash");
  const [depositReceiptNum, setDepositReceiptNum] = useState(booking.depositReceiptNum || "");
  const [balancePaid, setBalancePaid] = useState(booking.balancePaid);
  const [balanceMethod, setBalanceMethod] = useState(booking.balanceMethod || "cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api.updateRentalPayment(booking.id, { depositPaid, depositMethod, depositReceiptNum, balancePaid, balanceMethod });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 400, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Payment — {booking.renterName}</div>

        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
            <input type="checkbox" checked={depositPaid} onChange={(e) => setDepositPaid(e.target.checked)} />
            Deposit paid ({money(booking.depositAmount)})
          </label>
          {depositPaid && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <select style={inputStyle} value={depositMethod} onChange={(e) => setDepositMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
              </select>
              <input style={inputStyle} placeholder="Receipt / check #" value={depositReceiptNum} onChange={(e) => setDepositReceiptNum(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
            <input type="checkbox" checked={balancePaid} onChange={(e) => setBalancePaid(e.target.checked)} />
            Balance paid in full ({money((booking.quotedTotal || 0) - (booking.depositAmount || 0))})
          </label>
          {balancePaid && (
            <select style={inputStyle} value={balanceMethod} onChange={(e) => setBalanceMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
            </select>
          )}
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={button.ghost} onClick={onCancel}>Cancel</button>
          <button style={button.primary} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div style={{ width: 420, maxWidth: "100%", background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Sign contract</div>
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
    </div>
  );
}

function BookingForm({ spaces, onCreated, onError, error }) {
  const [form, setForm] = useState({
    spaceId: spaces[0]?.id || "", renterName: "", renterEmail: "", renterPhone: "", renterAddress: "",
    isMember: false, eventType: "", expectedGuests: "", startAt: "", endAt: "",
    wantsBartender: false, roundTables: "", longTables: "", chairs: "", kitchenUse: "", chafingDishes: "", notes: "",
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
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr", gap: 10 }}>
        <Field label="Renter name"><input style={inputStyle} required value={form.renterName} onChange={(e) => set("renterName", e.target.value)} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" required value={form.renterEmail} onChange={(e) => set("renterEmail", e.target.value)} /></Field>
        <Field label="Phone"><input style={inputStyle} value={form.renterPhone} onChange={(e) => set("renterPhone", e.target.value)} /></Field>
        <Field label="Club member?">
          <select style={inputStyle} value={form.isMember ? "yes" : "no"} onChange={(e) => set("isMember", e.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 10 }}>
        <Field label="Space">
          <select style={inputStyle} value={form.spaceId} onChange={(e) => set("spaceId", e.target.value)}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Event type"><input style={inputStyle} value={form.eventType} onChange={(e) => set("eventType", e.target.value)} /></Field>
        <Field label="Expected guests"><input style={inputStyle} type="number" min="0" value={form.expectedGuests} onChange={(e) => set("expectedGuests", e.target.value)} /></Field>
        <Field label="Address"><input style={inputStyle} value={form.renterAddress} onChange={(e) => set("renterAddress", e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Start"><input style={inputStyle} type="datetime-local" required value={form.startAt} onChange={(e) => set("startAt", e.target.value)} /></Field>
        <Field label="End"><input style={inputStyle} type="datetime-local" required value={form.endAt} onChange={(e) => set("endAt", e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
        {space?.offersBartender && (
          <Field label="Bartender?">
            <select style={inputStyle} value={form.wantsBartender ? "yes" : "no"} onChange={(e) => set("wantsBartender", e.target.value === "yes")}>
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
