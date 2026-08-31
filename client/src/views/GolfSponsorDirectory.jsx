import React, { useEffect, useMemo, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone, stripPhone } from "../lib/phone";
import DataList from "../components/DataList";
import Modal from "../components/Modal";

// The standing, tournament-independent sponsor list — every sponsor company
// ever recorded, live or historically imported (both funnel into the same
// GolfSponsorContact table, see golf.js's /sponsors route). This is the "who
// do we reach out to for next year's sponsorship" screen; GolfSponsors.jsx
// stays scoped to one tournament's own sponsorships and their payment status.
export default function GolfSponsorDirectory() {
  const [sponsors, setSponsors] = useState(null);
  const [search, setSearch] = useState("");
  const [editingSponsor, setEditingSponsor] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    api.listGolfSponsorDirectory().then(setSponsors).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  const filtered = useMemo(() => {
    if (!sponsors) return [];
    const q = search.trim().toLowerCase();
    if (!q) return sponsors;
    return sponsors.filter((s) =>
      s.companyName.toLowerCase().includes(q) ||
      (s.contactName || "").toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.phone.includes(q)
    );
  }, [sponsors, search]);

  if (sponsors === null) {
    return <div style={{ ...card, fontSize: 13, color: colors.textSecondary }}>Loading…</div>;
  }

  const totalRaised = sponsors.reduce((sum, s) => sum + s.totalRaised, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={pill("#f1ece0", colors.textSecondary)}>{sponsors.length} sponsor{sponsors.length === 1 ? "" : "s"} on file</span>
          <span style={pill(colors.successBg, colors.success)}>{money(totalRaised)} raised all-time</span>
        </div>
        <input
          style={{ ...inputStyle, maxWidth: 260 }}
          placeholder="Search company, contact, email, or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <DataList
          rows={filtered}
          emptyMessage={search ? "No sponsors match that search." : "No sponsors yet — they'll show up here once one is added to a tournament or a historical import is run."}
          columns={[
            { key: "company", label: "Company", grid: "1.2fr", primary: true, render: (s) => <div>{s.companyName}{s.contactName && <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{s.contactName}</div>}</div> },
            { key: "email", label: "Email", grid: "1.4fr", render: (s) => s.email || "—" },
            { key: "phone", label: "Phone", grid: "1fr", render: (s) => (s.phone ? formatPhone(s.phone) : "—") },
            { key: "history", label: "Sponsored", grid: "1fr", render: (s) => (s.sponsorshipCount > 0 ? `${s.sponsorshipCount}x, last ${s.lastYear}` : "Never") },
            { key: "raised", label: "Total raised", grid: "1fr", render: (s) => money(s.totalRaised) },
            {
              key: "actions", label: "", footerRow: true,
              render: (s) => <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingSponsor(s)}>Edit contact info</button>,
            },
          ]}
        />
      </div>

      {editingSponsor && (
        <EditSponsorModal
          sponsor={editingSponsor}
          onCancel={() => setEditingSponsor(null)}
          onSaved={() => { setEditingSponsor(null); refresh(); }}
        />
      )}
    </div>
  );
}

function EditSponsorModal({ sponsor, onCancel, onSaved }) {
  const [companyName, setCompanyName] = useState(sponsor.companyName);
  const [contactName, setContactName] = useState(sponsor.contactName || "");
  const [email, setEmail] = useState(sponsor.email);
  const [phone, setPhone] = useState(sponsor.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!companyName.trim()) return setError("A company name is required");
    setBusy(true);
    setError("");
    try {
      await api.updateGolfSponsorContact(sponsor.id, { companyName: companyName.trim(), contactName: contactName.trim(), email: email.trim(), phone: phone.trim() });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={420} title="Edit contact info">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input style={inputStyle} required placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        <input style={inputStyle} placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={inputStyle} placeholder="Phone" value={formatPhone(phone)} onChange={(e) => setPhone(stripPhone(e.target.value))} />
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
