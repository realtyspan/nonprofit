import React from "react";
import { colors, button, mono } from "../lib/tokens";
import { icons } from "../lib/icons";
import logo from "../assets/logo.png";

const FEATURES = [
  {
    icon: icons.table,
    title: "Sales Worksheet",
    body: "Log tickets sold and cash collected each time the machine is opened to retrieve funds and refill tickets — profit/loss computes live, no spreadsheet required.",
  },
  {
    icon: icons.layers,
    title: "Deal Lifecycle Tracking",
    body: "Log a game when it's received, activate it when it goes on the machine, and get flagged the moment it crosses your 75% close threshold.",
  },
  {
    icon: icons.fileCheck,
    title: "Real NYS Forms, Auto-Filled",
    body: "Schedule 1 and GC-7Q — the actual state forms, stamped with your quarter's numbers and ready to print and mail.",
  },
  {
    icon: icons.bank,
    title: "Bank Ledger & Receipts",
    body: "Categorized disbursements (ticket purchases, license fees, indirect costs) feed straight into your quarterly report math.",
  },
  {
    icon: icons.users,
    title: "Team & Roles",
    body: "Cashier, Chairperson, Preparer, Head — each person sees exactly what their role needs, nothing more.",
  },
  {
    icon: icons.userCircle,
    title: "Built for Audits",
    body: "Retention dates, sign-off trails, and a correction workflow that never lets a filed report silently drift.",
  },
];

const STEPS = [
  { n: "1", title: "Log sales when you service the machine", body: "Whoever checks the machine — based on usage, not a fixed schedule — logs tickets sold and prizes paid when they retrieve funds and refill tickets." },
  { n: "2", title: "Track deals to close", body: "Watch the 75% threshold, then close a deal with one form." },
  { n: "3", title: "File with confidence", body: "Generate the real Schedule 1 and GC-7Q PDFs, signed and ready to mail." },
];

export default function Landing({ onGetStarted, onLogin }) {
  return (
    <div style={{ background: colors.bg, color: colors.textPrimary, minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={logo} alt="Bell Jar Manager" style={{ width: 32, height: 32, objectFit: "contain" }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Bell Jar Manager</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={button.ghost} onClick={onLogin}>Log in</button>
          <button style={button.primary} onClick={onGetStarted}>Start free trial</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 880, margin: "0 auto", padding: "80px 32px 60px", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: colors.indigoBg, color: colors.indigo, fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 99, marginBottom: 20 }}>
          Built for NYS Bell Jar / Games of Chance compliance
        </div>
        <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15, margin: "0 0 18px" }}>
          Bell Jar compliance, without the quarterly scramble
        </h1>
        <p style={{ fontSize: 17, color: colors.textSecondary, lineHeight: 1.6, maxWidth: 640, margin: "0 auto 32px" }}>
          Track ticket sales, manage your deal inventory, and generate the real NYS Schedule 1 and
          GC-7Q forms — automatically, every quarter. Built for the volunteer Chairperson or Member
          in Charge who has a day job too.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={{ ...button.primary, fontSize: 15, padding: "12px 24px" }} onClick={onGetStarted}>
            Start your free 30-day trial
          </button>
          <button style={{ ...button.ghost, fontSize: 15, padding: "12px 24px" }} onClick={onLogin}>
            Log in
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: colors.textTertiary, marginTop: 12 }}>No credit card required</div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 32px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 12, padding: 22 }}>
              <div
                dangerouslySetInnerHTML={{ __html: f.icon }}
                style={{ width: 26, height: 26, color: colors.accent, marginBottom: 14, display: "flex" }}
              />
              <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 1.55 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: "#fff", borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "70px 32px" }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", marginBottom: 48 }}>How it works</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 32 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ textAlign: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 99, background: colors.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 700, margin: "0 auto 16px" }}>
                  {s.n}
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 1.55 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ maxWidth: 640, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>Simple, flat pricing</h2>
        <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 36 }}>
          One price for your whole lodge — every role, every feature. No per-seat games.
        </p>
        <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 36 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.accent, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
            Bell Jar Manager
          </div>
          <div style={{ fontFamily: mono, fontSize: 44, fontWeight: 800, marginBottom: 2 }}>$39</div>
          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>per month, per organization</div>
          <div style={{ fontSize: 12.5, color: colors.textTertiary, marginBottom: 24 }}>or $390/year — 2 months free</div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", textAlign: "left", display: "inline-block", fontSize: 13.5, color: colors.textPrimary, lineHeight: 2.1 }}>
            <li>✓ Unlimited users, all roles</li>
            <li>✓ Real Schedule 1 &amp; GC-7Q PDF generation</li>
            <li>✓ Sales worksheet, deal tracking, ledger</li>
            <li>✓ 30-day free trial, no card required</li>
          </ul>
          <div>
            <button style={{ ...button.primary, fontSize: 15, padding: "12px 28px", width: "100%" }} onClick={onGetStarted}>
              Start your free trial
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${colors.border}`, padding: "28px 32px", textAlign: "center", fontSize: 12, color: colors.textTertiary }}>
        Bell Jar Manager · Not affiliated with the NYS Gaming Commission — built to match its official forms
      </footer>
    </div>
  );
}
