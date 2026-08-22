import React, { useState } from "react";
import { colors, card, button, input } from "../lib/tokens";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import logo from "../assets/logo.png";

export default function Login({ initialMode = "login", onBack }) {
  const { login, signupOrg } = useAuth();
  const [mode, setMode] = useState(initialMode); // login | signup | forgot
  const [form, setForm] = useState({ email: "", password: "", orgName: "", name: "", licenseId: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setForgotSent(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else if (mode === "signup") {
        await signupOrg(form);
      } else {
        await api.forgotPassword(form.email);
        setForgotSent(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
      <form onSubmit={submit} style={{ ...card, width: 380, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, cursor: onBack ? "pointer" : "default" }}
          onClick={onBack}
        >
          <img src={logo} alt="Charity Pulse" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>Charity Pulse</div>
        </div>

        {mode === "signup" && (
          <>
            <Field label="Organization name">
              <input style={input} required value={form.orgName} onChange={(e) => set("orgName", e.target.value)} placeholder="Red Hook Rhinebeck Lodge #2022" />
            </Field>
            <Field label="Your name">
              <input style={input} required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Games of Chance license # (optional — add later if you don't have it yet)">
              <input style={input} value={form.licenseId} onChange={(e) => set("licenseId", e.target.value)} placeholder="NYS-BJ-XXXX" />
            </Field>
          </>
        )}

        {mode === "forgot" ? (
          forgotSent ? (
            <div style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 1.5 }}>
              If an account exists for <strong>{form.email}</strong>, a password reset link is on its way — check your email (it expires in 1 hour).
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: -6 }}>
                Enter your email and we'll send a link to reset your password.
              </div>
              <Field label="Email">
                <input style={input} type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@lodge.org" />
              </Field>
            </>
          )
        ) : (
          <>
            <Field label="Email">
              <input style={input} type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@lodge.org" />
            </Field>
            <Field label="Password">
              <input style={input} type="password" required value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
            </Field>
          </>
        )}

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        {!(mode === "forgot" && forgotSent) && (
          <button type="submit" disabled={busy} style={{ ...button.primary, marginTop: 4 }}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Create organization" : "Send reset link"}
          </button>
        )}

        <div style={{ fontSize: 12.5, color: colors.textSecondary, textAlign: "center", marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
          {mode === "login" && (
            <>
              <div>New lodge? <a href="#" onClick={(e) => { e.preventDefault(); switchMode("signup"); }} style={{ color: colors.accent }}>Create an organization</a></div>
              <div><a href="#" onClick={(e) => { e.preventDefault(); switchMode("forgot"); }} style={{ color: colors.accent }}>Forgot your password?</a></div>
            </>
          )}
          {mode === "signup" && (
            <div>Already set up? <a href="#" onClick={(e) => { e.preventDefault(); switchMode("login"); }} style={{ color: colors.accent }}>Log in</a></div>
          )}
          {mode === "forgot" && (
            <div><a href="#" onClick={(e) => { e.preventDefault(); switchMode("login"); }} style={{ color: colors.accent }}>Back to log in</a></div>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
