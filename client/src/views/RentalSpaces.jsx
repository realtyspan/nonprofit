import React, { useState } from "react";
import { colors, card, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import PublicLinkBox from "../components/PublicLinkBox";
import DataList from "../components/DataList";
import Modal from "../components/Modal";

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

        <DataList
          rows={spaces}
          emptyMessage="No spaces set up yet."
          columns={[
            {
              key: "name", label: "Space", grid: "1.6fr", primary: true,
              render: (s) => (
                <>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  {!s.active && <div style={{ fontSize: 11, color: colors.textTertiary }}>Inactive</div>}
                </>
              ),
            },
            { key: "capacity", label: "Capacity", grid: "1fr", render: (s) => s.capacity ?? "—" },
            { key: "memberRate", label: "Member rate", grid: "1fr", render: (s) => `${money(s.baseRateMember)} / ${s.blockHours}hr` },
            { key: "nonMemberRate", label: "Non-member rate", grid: "1fr", render: (s) => `${money(s.baseRateNonMember)} / ${s.blockHours}hr` },
            { key: "deposit", label: "Deposit", grid: "1fr", render: (s) => money(s.depositAmount) },
            { key: "action", label: "", grid: "auto", fullWidthOnMobile: true, render: (s) => <button style={button.ghost} onClick={() => setEditing(s)}>Edit</button> },
          ]}
        />
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
    <Modal onCancel={onCancel} width={560}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{isNew ? "Add a space" : `Edit “${space.name}”`}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Capacity"><input style={inputStyle} type="number" min="0" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
          <Field label="Block hours"><input style={inputStyle} type="number" min="1" value={form.blockHours} onChange={(e) => set("blockHours", e.target.value)} /></Field>
        </div>

        <Section title="Rental rate">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <Field label="Base (block rate)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.bartenderBaseRate} onChange={(e) => set("bartenderBaseRate", e.target.value)} /></Field>
              <Field label="Overage / hr"><input style={inputStyle} type="number" step="0.01" min="0" value={form.bartenderOverageRate} onChange={(e) => set("bartenderOverageRate", e.target.value)} /></Field>
            </div>
          )}
        </Section>

        <Section title="Equipment & kitchen fees">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              <Field label="Round table (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.linenRoundTableFee} onChange={(e) => set("linenRoundTableFee", e.target.value)} /></Field>
              <Field label="8' table (ea)"><input style={inputStyle} type="number" step="0.01" min="0" value={form.linenLongTableFee} onChange={(e) => set("linenLongTableFee", e.target.value)} /></Field>
              <Field label="Per guest"><input style={inputStyle} type="number" step="0.01" min="0" value={form.linenPerGuestFee} onChange={(e) => set("linenPerGuestFee", e.target.value)} /></Field>
            </div>
          )}
        </Section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, alignItems: "end" }}>
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
    </Modal>
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
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
