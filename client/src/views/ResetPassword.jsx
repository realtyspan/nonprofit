import React, { useState } from "react";
import { colors, card, button, input } from "../lib/tokens";
import { api } from "../lib/api";
import logo from "../assets/logo.png";

// Landing page for the link in the "forgot password" email — reads its token
// from the query string, so it works for a logged-out visitor with no other
// app state. Doesn't log the user in on success; they go log in normally with
// the new password, same as after any other password change.
export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
      <div style={{ ...card, width: 380, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <img src={logo} alt="Charity Pulse" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>Charity Pulse</div>
        </div>

        {!token ? (
          <div style={{ fontSize: 13, color: colors.danger }}>
            This link is missing its reset code — copy the full link from the email, or request a new one from the login screen.
          </div>
        ) : done ? (
          <>
            <div style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 1.5 }}>
              Your password has been updated. You can log in with it now.
            </div>
            <a href="/" style={{ ...button.primary, textAlign: "center", textDecoration: "none", marginTop: 4 }}>Go to log in</a>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Set a new password</div>
            <Field label="New password">
              <input style={input} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </Field>
            <Field label="Confirm new password">
              <input style={input} type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
            </Field>
            {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ ...button.primary, marginTop: 4 }}>
              {busy ? "Please wait…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
