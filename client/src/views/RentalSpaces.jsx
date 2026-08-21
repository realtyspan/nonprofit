import React, { useState } from "react";
import { colors, card, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import PublicLinkBox from "../components/PublicLinkBox";

export default function RentalSpaces({ spaces, onChanged }) {
  const [editing, setEditing] = useState(null); // space being edited, or {} for new

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PublicLinkBox basePath="rentals" embedBasePath="rentals/embed" embedTitle="Rental Request" description="Set a link so renters can check availability and submit a request from your website." />

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Spaces & rates</div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Hall, Pavilion, Club Deck — pricing, bartender add-on, and equipment fees.</div>
          </div>
          <button style={button.ghost} onClick={() => setEditing({})}>+ Add space</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr auto", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Space</div>
          <div>Capacity</div>
          <div>Member rate</div>
          <div>Non-member rate</div>
          <div>Deposit</div>
          <div></div>
        </div>
        {spaces.map((s) => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr auto", padding: "12px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {!s.active && <div style={{ fontSize: 11, color: colors.textTertiary }}>Inactive</div>}
            </div>
            <div>{s.capacity ?? "—"}</div>
            <div>{money(s.baseRateMember)} / {s.blockHours}hr</div>
            <div>{money(s.baseRateNonMember)} / {s.blockHours}hr</div>
            <div>{money(s.depositAmount)}</div>
            <button style={button.ghost} onClick={() => setEditing(s)}>Edit</button>
          </div>
        ))}
        {spaces.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No spaces set up yet.</div>}
      </div>

      {editing && (
        <SpaceModal
          space={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function SpaceModal({ space, onCancel, onSaved }) {
  const isNew = !space.id;
  const [form, setForm] = useState({
    name: space.name || "",
    capacity: space.capacity ?? "",
    blockHours: space.blockHours ?? 4,
    baseRateMember: space.baseRateMember ?? 0,
    baseRateNonMember: space.baseRateNonMember ?? 0,
    overageRateMember: space.overageRateMember ?? 0,
    overageRateNonMember: space.overageRateNonMember ?? 0,
    offersBartender: space.offersBartender ?? false,
    bartenderBaseRate: space.bartenderBaseRate ?? 0,
    bartenderOverageRate: space.bartenderOverageRate ?? 0,
    roundTableFee: space.roundTableFee ?? 0,
    longTableFee: space.longTableFee ?? 0,
    chairFee: space.chairFee ?? 0,
    kitchenNoOvenFee: space.kitchenNoOvenFee ?? 0,
    kitchenWithOvenFee: space.kitchenWithOvenFee ?? 0,
    chafingDishFee: space.chafingDishFee ?? 0,
    offersLinen: space.offersLinen ?? false,
    linenRoundTableFee: space.linenRoundTableFee ?? 0,
    linenLongTableFee: space.linenLongTableFee ?? 0,
    linenPerGuestFee: space.linenPerGuestFee ?? 0,
    depositAmount: space.depositAmount ?? 0,
    active: space.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const numericKeys = [
    "capacity", "blockHours", "baseRateMember", "baseRateNonMember", "overageRateMember", "overageRateNonMember",
    "bartenderBaseRate", "bartenderOverageRate", "roundTableFee", "longTableFee", "chairFee",
    "kitchenNoOvenFee", "kitchenWithOvenFee", "chafingDishFee",
    "linenRoundTableFee", "linenLongTableFee", "linenPerGuestFee", "depositAmount",
  ];

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = { ...form };
      for (const k of numericKeys) payload[k] = k === "capacity" && form[k] === "" ? null : Number(payload[k]);
      if (isNew) await api.createRentalSpace(payload);
      else await api.updateRentalSpace(space.id, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, overflowY: "auto", padding: 24 }}>
      <form onSubmit={submit} style={{ width: 560, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{isNew ? "Add a space" : `Edit “${space.name}”`}</div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
          <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Capacity"><input style={inputStyle} type="number" min="0" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
          <Field label="Block hours"><input style={inputStyle} type="number" min="1" value={form.blockHours} onChange={(e) => set("blockHours", e.target.value)} /></Field>
        </div>

        <Section title="Rental rate">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Member (block rate)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.baseRateMember} onChange={(e) => set("baseRateMember", e.target.value)} /></Field>
            <Field label="Non-member (block rate)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.baseRateNonMember} onChange={(e) => set("baseRateNonMember", e.target.value)} /></Field>
            <Field label="Member overage / hr"><input style={inputStyle} type="number" step="0.01" min="0" value={form.overageRateMember} onChange={(e) => set("overageRateMember", e.target.value)} /></Field>
            <Field label="Non-member overage / hr"><input style={inputStyle} type="number" step="0.01" min="0" value={form.overageRateNonMember} onChange={(e) => set("overageRateNonMember", e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Bartender service">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 8 }}>
            <input type="checkbox" checked={form.offersBartender} onChange={(e) => set("offersBartender", e.target.checked)} />
            Offered for this space
          </label>
          {form.offersBartender && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Base (block rate)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.bartenderBaseRate} onChange={(e) => set("bartenderBaseRate", e.target.value)} /></Field>
              <Field label="Overage / hr"><input style={inputStyle} type="number" step="0.01" min="0" value={form.bartenderOverageRate} onChange={(e) => set("bartenderOverageRate", e.target.value)} /></Field>
            </div>
          )}
        </Section>

        <Section title="Equipment & kitchen fees">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Round table (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.roundTableFee} onChange={(e) => set("roundTableFee", e.target.value)} /></Field>
            <Field label="8' table (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.longTableFee} onChange={(e) => set("longTableFee", e.target.value)} /></Field>
            <Field label="Chair (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.chairFee} onChange={(e) => set("chairFee", e.target.value)} /></Field>
            <Field label="Kitchen (no oven)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.kitchenNoOvenFee} onChange={(e) => set("kitchenNoOvenFee", e.target.value)} /></Field>
            <Field label="Kitchen (with oven)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.kitchenWithOvenFee} onChange={(e) => set("kitchenWithOvenFee", e.target.value)} /></Field>
            <Field label="Chafing dish (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.chafingDishFee} onChange={(e) => set("chafingDishFee", e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Linen service">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 8 }}>
            <input type="checkbox" checked={form.offersLinen} onChange={(e) => set("offersLinen", e.target.checked)} />
            Offered for this space
          </label>
          {form.offersLinen && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Field label="Round table (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.linenRoundTableFee} onChange={(e) => set("linenRoundTableFee", e.target.value)} /></Field>
              <Field label="8' table (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.linenLongTableFee} onChange={(e) => set("linenLongTableFee", e.target.value)} /></Field>
              <Field label="Per guest"><input style={inputStyle} type="number" step="0.01" min="0" value={form.linenPerGuestFee} onChange={(e) => set("linenPerGuestFee", e.target.value)} /></Field>
            </div>
          )}
        </Section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
          <Field label="Reservation deposit"><input style={inputStyle} type="number" step="0.01" min="0" value={form.depositAmount} onChange={(e) => set("depositAmount", e.target.value)} /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, paddingBottom: 8 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            Active (bookable)
          </label>
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save space"}</button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: colors.textSecondary, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
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
