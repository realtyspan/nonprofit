import React, { useEffect, useState } from "react";
import { colors, card, button, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import logo from "../assets/logo.png";

export default function PublicGolfPay({ slug, tournamentId, teamId }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");

  function reload() {
    publicApi.getGolfTeamForPay(slug, tournamentId, teamId).then(setData).catch((err) => setLoadError(err.message));
  }

  useEffect(reload, [slug, tournamentId, teamId]);

  if (loadError) return <Centered>This page isn't available.</Centered>;
  if (!data) return <Centered>Loading…</Centered>;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.textPrimary }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
        <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>Pay for your team</div>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 20px 60px" }}>
        <PayCard slug={slug} tournamentId={tournamentId} teamId={teamId} data={data} onPaid={reload} />
      </div>
    </div>
  );
}

function PayCard({ slug, tournamentId, teamId, data, onPaid }) {
  const { team, payment } = data;
  const unpaid = team.players.filter((p) => p.paymentStatus !== "paid");
  const paid = team.players.filter((p) => p.paymentStatus === "paid");

  const [selected, setSelected] = useState(() => new Set(unpaid.map((p) => p.id)));
  const [method, setMethod] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(null);

  const availableMethods = [
    payment.allowCheckPayment && { value: "check", label: "Pay by check" },
    payment.allowInPersonPayment && { value: "in_person", label: "Pay in person" },
  ].filter(Boolean);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = unpaid.filter((p) => selected.has(p.id)).reduce((sum, p) => sum + p.amountDue, 0);

  async function submit() {
    if (selected.size === 0) return setError("Select at least one player");
    if (!method) return setError("Choose a payment method");
    setBusy(true);
    setError("");
    try {
      await publicApi.payForGolfTeam(slug, tournamentId, teamId, { teamPlayerIds: Array.from(selected), paymentMethod: method });
      setConfirmed(method);
      onPaid();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{team.name || "Your team"}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {unpaid.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "6px 0" }}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={!!confirmed} />
            <span style={{ flex: 1 }}>{p.name}{p.isCaptain ? " (captain)" : ""}</span>
            <span style={{ color: colors.textSecondary }}>{money(p.amountDue)}</span>
          </label>
        ))}
        {paid.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "6px 0", opacity: 0.55 }}>
            <span style={{ flex: 1 }}>{p.name}{p.isCaptain ? " (captain)" : ""}</span>
            <span style={{ color: colors.success, fontWeight: 600 }}>Paid</span>
          </div>
        ))}
      </div>

      {unpaid.length === 0 ? (
        <div style={{ fontSize: 13.5, color: colors.success, fontWeight: 600 }}>Everyone on this team is paid up. Thank you!</div>
      ) : confirmed ? (
        <div style={{ padding: 14, background: colors.successBg, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.success }}>Got it — thanks!</div>
          {confirmed === "check" && <div style={{ fontSize: 12.5 }}>{payment.checkPayableInstructions || "Contact the organizer for check instructions."}</div>}
          {confirmed === "in_person" && <div style={{ fontSize: 12.5 }}>{payment.inPersonPaymentInstructions || "Contact the organizer for in-person payment instructions."}</div>}
        </div>
      ) : (
        <>
          {availableMethods.length === 0 ? (
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>The organizer will follow up with payment instructions.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {availableMethods.map((m) => (
                <label key={m.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                  <input type="radio" name="method" checked={method === m.value} onChange={() => setMethod(m.value)} />
                  {m.label}
                </label>
              ))}
            </div>
          )}

          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Total selected: {money(total)}</div>
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

          {availableMethods.length > 0 && (
            <button style={button.primary} disabled={busy} onClick={submit}>
              {busy ? "Submitting…" : "Confirm payment method"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
      <div style={{ fontSize: 13.5, color: colors.textSecondary }}>{children}</div>
    </div>
  );
}
