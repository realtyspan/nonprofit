import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

const ROLE_META = {
  Head: { bg: colors.indigoBg, color: colors.indigo },
  Chairperson: { bg: colors.warningBg, color: colors.warning },
  Preparer: { bg: colors.successBg, color: colors.success },
  Cashier: { bg: "#f0f0f3", color: colors.textSecondary },
};

export default function Team() {
  const { session } = useAuth();
  const canInvite = ["Head", "Chairperson"].includes(session.user.role);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    api.listUsers().then(setUsers).catch(() => {});
  }
  useEffect(refresh, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Team</div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Everyone with access to this organization.</div>
          </div>
          {canInvite && (
            <button style={button.ghost} onClick={() => setShowForm((s) => !s)}>{showForm ? "− Cancel" : "+ Invite teammate"}</button>
          )}
        </div>

        {showForm && (
          <InviteForm
            onError={setError}
            error={error}
            onInvited={() => {
              setShowForm(false);
              setError("");
              refresh();
            }}
          />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Joined</div>
        </div>
        {users.map((u) => {
          const meta = ROLE_META[u.role] || ROLE_META.Cashier;
          return (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr", padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5, alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>{u.name}</div>
              <div style={{ color: colors.textSecondary }}>{u.email}</div>
              <div><span style={pill(meta.bg, meta.color)}>{u.role}</span></div>
              <div style={{ color: colors.textSecondary, fontSize: 12.5 }}>{new Date(u.createdAt).toLocaleDateString()}</div>
            </div>
          );
        })}
        {users.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No teammates yet.</div>}
      </div>
    </div>
  );
}

function InviteForm({ onInvited, onError, error }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Cashier" });
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    onError("");
    setBusy(true);
    try {
      await api.inviteUser(form);
      onInvited();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 1.2fr 1fr auto", gap: 10, alignItems: "end", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}`, background: "#fafafa" }}>
      <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Email"><input style={inputStyle} type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
      <Field label="Temporary password"><input style={inputStyle} type="password" required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} /></Field>
      <Field label="Role">
        <select style={inputStyle} value={form.role} onChange={(e) => set("role", e.target.value)}>
          <option value="Cashier">Cashier</option>
          <option value="Chairperson">Chairperson</option>
          <option value="Preparer">Preparer</option>
          <option value="Head">Head</option>
        </select>
      </Field>
      <button style={button.primary} type="submit" disabled={busy}>{busy ? "Inviting…" : "Invite"}</button>
      {error && <div style={{ gridColumn: "1 / -1", color: colors.danger, fontSize: 12.5 }}>{error}</div>}
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
