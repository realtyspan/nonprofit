import React, { useEffect, useState } from "react";
import { colors, card, button, money } from "../lib/tokens";
import { publicApi } from "../lib/api";
import logo from "../assets/logo.png";

// Direct port of PublicGolfPay.jsx, generalized off golf and keyed by
// org+tournament slug instead of org slug + tournament id (since more than
// one tournament can be open for this org at once).
const STRIPE_SESSION_STORAGE_KEY = "tournamentPayStripeSessionId";

export default function PublicTournamentPay({ orgSlug, tournamentSlug, teamId }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [finalizing, setFinalizing] = useState(false);

  function reload() {
    publicApi.getTournamentTeamForPay(orgSlug, tournamentSlug, teamId).then(setData).catch((err) => setLoadError(err.message));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeReturn = params.get("stripeReturn") === "1";
    const stripeCanceled = params.get("stripeCanceled") === "1";
    const sessionId = params.get("session_id") || sessionStorage.getItem(STRIPE_SESSION_STORAGE_KEY) || "";

    if (!stripeReturn && !stripeCanceled) {
      reload();
      return;
    }

    const cleanup = () => {
      sessionStorage.removeItem(STRIPE_SESSION_STORAGE_KEY);
      window.history.replaceState({}, "", window.location.pathname);
    };

    if (stripeReturn) {
      setFinalizing(true);
      publicApi.syncTournamentPayment(orgSlug, tournamentSlug, teamId, sessionId)
        .then(setData)
        .catch((err) => setLoadError(err.message))
        .finally(() => { setFinalizing(false); cleanup(); });
    } else {
      publicApi.cancelTournamentPayment(orgSlug, tournamentSlug, teamId, sessionId)
        .then(setData)
        .catch((err) => setLoadError(err.message))
        .finally(cleanup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, tournamentSlug, teamId]);

  if (loadError) return <Centered>This page isn't available.</Centered>;
  if (finalizing) return <Centered>Finalizing your payment…</Centered>;
  if (!data) return <Centered>Loading…</Centered>;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.textPrimary }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
        <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>Pay for your team</div>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 20px 60px" }}>
        <PayCard orgSlug={orgSlug} tournamentSlug={tournamentSlug} teamId={teamId} data={data} onPaid={reload} />
      </div>
    </div>
  );
}

function PayCard({ orgSlug, tournamentSlug, teamId, data, onPaid }) {
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
      await publicApi.payForTournamentTeam(orgSlug, tournamentSlug, teamId, { teamPlayerIds: Array.from(selected), paymentMethod: method });
      setConfirmed(method);
      onPaid();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function payOnline() {
    if (selected.size === 0) return setError("Select at least one player");
    setBusy(true);
    setError("");
    try {
      const result = await publicApi.payForTournamentTeam(orgSlug, tournamentSlug, teamId, { teamPlayerIds: Array.from(selected), paymentMethod: "stripe" });
      if (result.checkoutUrl) {
        sessionStorage.setItem(STRIPE_SESSION_STORAGE_KEY, result.sessionId || "");
        window.location.href = result.checkoutUrl;
        return;
      }
      onPaid();
    } catch (err) {
      setError(err.message);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13.5, color: colors.success, fontWeight: 600 }}>Everyone on this team is paid up. Thank you!</div>
          <BackToTournamentButton orgSlug={orgSlug} tournamentSlug={tournamentSlug} />
        </div>
      ) : confirmed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: 14, background: colors.successBg, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.success }}>Got it — thanks!</div>
            {confirmed === "check" && <div style={{ fontSize: 12.5 }}>{payment.checkPayableInstructions || "Contact the organizer for check instructions."}</div>}
            {confirmed === "in_person" && <div style={{ fontSize: 12.5 }}>{payment.inPersonPaymentInstructions || "Contact the organizer for in-person payment instructions."}</div>}
          </div>
          <BackToTournamentButton orgSlug={orgSlug} tournamentSlug={tournamentSlug} />
        </div>
      ) : (
        <>
          {payment.payOnlineAvailable && (
            <button style={button.primary} disabled={busy} onClick={payOnline}>
              {busy ? "Redirecting…" : `Pay ${money(total)} online with card`}
            </button>
          )}

          {availableMethods.length === 0 && !payment.payOnlineAvailable && (
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>The organizer will follow up with payment instructions.</div>
          )}

          {availableMethods.length > 0 && (
            <>
              {payment.payOnlineAvailable && (
                <div style={{ fontSize: 11.5, color: colors.textSecondary, textAlign: "center" }}>— or —</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {availableMethods.map((m) => (
                  <label key={m.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                    <input type="radio" name="method" checked={method === m.value} onChange={() => setMethod(m.value)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Total selected: {money(total)}</div>
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

          {availableMethods.length > 0 && (
            <button style={button.ghost} disabled={busy} onClick={submit}>
              {busy ? "Submitting…" : "Confirm payment method"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function BackToTournamentButton({ orgSlug, tournamentSlug }) {
  return (
    <button style={button.ghost} onClick={() => { window.location.href = `/tournaments/${orgSlug}/${tournamentSlug}`; }}>
      Back to tournament page
    </button>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
      <div style={{ fontSize: 13.5, color: colors.textSecondary }}>{children}</div>
    </div>
  );
}
