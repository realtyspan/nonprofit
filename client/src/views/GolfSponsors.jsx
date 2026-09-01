import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone, stripPhone } from "../lib/phone";
import DataList from "../components/DataList";
import { useConfirm } from "../lib/ConfirmContext";
import DirectorySearchField from "../components/DirectorySearchField";

// Sponsorship management — the parallel fundraising track alongside player
// registration. Admin-entered only in this pass; a public sponsor-inquiry
// form is a later build step (see plan doc).
export default function GolfSponsors({ tournament }) {
  const [sponsorships, setSponsorships] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();

  function refresh() {
    if (!tournament) return;
    api.listGolfSponsorships(tournament.id).then(setSponsorships).catch((err) => setError(err.message));
  }
  useEffect(refresh, [tournament?.id]);

  if (!tournament) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>No tournament selected.</div>;
  }

  const totalRaised = sponsorships.filter((s) => s.paid).reduce((sum, s) => sum + (s.amount || 0), 0);
  const pendingInquiries = sponsorships.filter((s) => s.status === "inquiry");

  async function confirmInquiry(id) {
    try {
      await api.confirmGolfSponsorship(tournament.id, id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteSponsorship(s) {
    if (!(await confirm(`Remove ${s.sponsor.companyName} as a sponsor? This can't be undone.`, { confirmLabel: "Remove" }))) return;
    try {
      await api.deleteGolfSponsorship(tournament.id, s.id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePaid(s) {
    try {
      await api.updateGolfSponsorship(tournament.id, s.id, { paid: !s.paid, paymentMethod: s.paid ? undefined : "check" });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={pill("#f1ece0", colors.textSecondary)}>{sponsorships.length} sponsor{sponsorships.length === 1 ? "" : "s"}</span>
        <span style={pill(colors.successBg, colors.success)}>{money(totalRaised)} raised</span>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      {pendingInquiries.length > 0 && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Inquiries needing confirmation ({pendingInquiries.length})</div>
          {pendingInquiries.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${colors.borderLight}` }}>
              <div>{s.sponsor.companyName}{s.tierName ? ` — ${s.tierName}` : ""}</div>
              <button style={button.ghost} onClick={() => confirmInquiry(s.id)}>Confirm</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Sponsors</div>
        </div>
        <DataList
          rows={sponsorships.filter((s) => s.status !== "inquiry")}
          emptyMessage="No sponsors yet."
          columns={[
            { key: "company", label: "Company", grid: "1.4fr", primary: true, render: (s) => <div>{s.sponsor.companyName}{s.sponsor.contactName && <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{s.sponsor.contactName}</div>}</div> },
            { key: "tier", label: "Tier", grid: "1fr", render: (s) => s.tierName || "—" },
            { key: "amount", label: "Amount", grid: "1fr", render: (s) => (s.amount != null ? money(s.amount) : "—") },
            { key: "paid", label: "Paid", grid: "1fr", render: (s) => <span style={pill(s.paid ? colors.successBg : colors.warningBg, s.paid ? colors.success : colors.warning)}>{s.paid ? "Paid" : "Unpaid"}</span> },
            {
              key: "actions", label: "", footerRow: true,
              render: (s) => (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => togglePaid(s)}>{s.paid ? "Mark unpaid" : "Mark paid"}</button>
                  <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={() => deleteSponsorship(s)}>Remove</button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {!showAddForm ? (
        <div><button style={button.primary} onClick={() => setShowAddForm(true)}>+ Add sponsor</button></div>
      ) : (
        <AddSponsorForm tournament={tournament} onCancel={() => setShowAddForm(false)} onAdded={() => { setShowAddForm(false); refresh(); }} />
      )}
    </div>
  );
}

function AddSponsorForm({ tournament, onCancel, onAdded }) {
  const [form, setForm] = useState({ companyName: "", contactName: "", email: "", phone: "", tierName: "", amount: "", benefitsText: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.companyName.trim()) return setError("A company name is required");
    setBusy(true);
    setError("");
    try {
      await api.createGolfSponsorship(tournament.id, form);
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>Add sponsor</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <DirectorySearchField
          placeholder="Search existing sponsors by company or email…"
          searchFn={api.searchGolfSponsors}
          renderResult={(s) => (
            <div>
              <strong>{s.companyName}</strong>{s.contactName ? ` — ${s.contactName}` : ""}{s.email ? ` · ${s.email}` : ""}
              {s.sponsorshipCount > 0 && <span style={{ color: colors.textSecondary }}> · sponsored {s.sponsorshipCount}x, last {s.lastYear}</span>}
            </div>
          )}
          onSelect={(s) => {
            set("companyName", s.companyName);
            set("contactName", s.contactName || "");
            set("email", s.email);
            set("phone", s.phone);
          }}
        />
        <input style={inputStyle} required placeholder="Company name" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
        <input style={inputStyle} placeholder="Contact name (optional)" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <input style={inputStyle} type="email" placeholder="Contact email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <input style={inputStyle} placeholder="Contact phone" value={formatPhone(form.phone)} onChange={(e) => set("phone", stripPhone(e.target.value))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <input style={inputStyle} placeholder="Tier (e.g. Gold)" value={form.tierName} onChange={(e) => set("tierName", e.target.value)} />
          <input style={inputStyle} type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} placeholder="Benefits (e.g. sign on hole 3, logo on program)" value={form.benefitsText} onChange={(e) => set("benefitsText", e.target.value)} />
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Adding…" : "Add sponsor"}</button>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
