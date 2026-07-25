import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export default function Profile() {
  const { updateUser } = useAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    api.getMe().then(setMe).catch(() => {});
  }, []);

  if (!me) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 560 }}>
      <ProfileCard me={me} onSaved={(updated) => { setMe(updated); updateUser(updated); }} />
      <PasswordCard />
    </div>
  );
}

function ProfileCard({ me, onSaved }) {
  const [form, setForm] = useState({
    name: me.name,
    email: me.email,
    title: me.title || "",
    phone: me.phone || "",
    homeAddress: me.homeAddress || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const updated = await api.updateMe(form);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Your profile</div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
        Title, phone, and home address are used to fill out your signature block on the GC-7Q report.
      </div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Role">
          <input style={{ ...inputStyle, background: "#f4f4f6", color: colors.textSecondary }} value={me.role} disabled />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <Field label="Title"><input style={inputStyle} placeholder="Chairperson" value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Phone"><input style={inputStyle} placeholder="(555) 123-4567" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        </div>
        <Field label="Home address, city, and zip">
          <input style={inputStyle} placeholder="123 Main St, Red Hook, NY 12571" value={form.homeAddress} onChange={(e) => set("homeAddress", e.target.value)} />
        </Field>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
          {saved && <span style={{ color: colors.success, fontSize: 12.5, fontWeight: 600 }}>✓ Saved</span>}
          <button style={button.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
        </div>
      </form>
    </div>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Change password</div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>Requires your current password.</div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Current password">
          <input style={inputStyle} type="password" required value={form.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="New password">
            <input style={inputStyle} type="password" required minLength={8} value={form.newPassword} onChange={(e) => set("newPassword", e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <input style={inputStyle} type="password" required minLength={8} value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} />
          </Field>
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
          {saved && <span style={{ color: colors.success, fontSize: 12.5, fontWeight: 600 }}>✓ Password updated</span>}
          <button style={button.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
