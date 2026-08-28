import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { MODULES } from "../lib/modules";
import DataList from "../components/DataList";

const GC7Q_SLOTS = ["Head", "Preparer", "Member"];

export default function Team({ permissions, onPermissionsChanged }) {
  const { session } = useAuth();
  const [users, setUsers] = useState([]);
  const [labels, setLabels] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState("");

  const isOwner = permissions?.orgTier === "Owner";
  const adminModules = MODULES.filter((m) => permissions?.moduleGrants?.[m.key] === "Admin").map((m) => m.key);
  const canInvite = isOwner || adminModules.length > 0;

  function refresh() {
    api.listUsers().then(setUsers).catch(() => {});
    api.getTierLabels().then(setLabels).catch(() => {});
  }
  useEffect(refresh, []);

  async function act(fn) {
    try {
      await fn();
      refresh();
      onPermissionsChanged?.();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <OrganizationInfoCard isOwner={isOwner} />

      {isOwner && <LabelsCard labels={labels} onSaved={refresh} />}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Team</div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Everyone with access to this organization.</div>
          </div>
          {canInvite && (
            <button style={button.ghost} onClick={() => setShowInvite((s) => !s)}>{showInvite ? "− Cancel" : "+ Invite teammate"}</button>
          )}
        </div>

        {showInvite && (
          <InviteForm
            isOwner={isOwner}
            adminModules={adminModules}
            error={error}
            onError={setError}
            onInvited={() => { setShowInvite(false); setError(""); refresh(); }}
          />
        )}

        <DataList
          rows={users}
          emptyMessage="No teammates yet."
          columns={[
            {
              key: "name", label: "Name", grid: "1.2fr", primary: true,
              render: (u) => (
                <>
                  {u.name}
                  {u.id === session?.user?.id && <span style={{ color: colors.textTertiary, fontWeight: 400 }}> (you)</span>}
                </>
              ),
            },
            { key: "email", label: "Email", grid: "1.6fr", render: (u) => <span style={{ color: colors.textSecondary }}>{u.email}</span> },
            {
              key: "orgTier", label: "Org tier", grid: "0.8fr",
              render: (u) => isOwner ? (
                <select
                  style={{ ...inputStyle, fontSize: 12, padding: "5px 6px" }}
                  value={u.orgTier || ""}
                  onChange={(e) => act(() => api.setOrgTier(u.id, e.target.value || null))}
                >
                  <option value="">Module only</option>
                  <option value="Viewer">Viewer</option>
                  <option value="Owner">Owner</option>
                </select>
              ) : u.orgTier ? (
                <span style={pill(colors.indigoBg, colors.indigo)}>{u.orgTier}</span>
              ) : (
                <span style={{ color: colors.textTertiary }}>Module only</span>
              ),
            },
            {
              key: "moduleAccess", label: "Module access", grid: "2fr", fullWidthOnMobile: true,
              render: (u) => (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {MODULES.map((m) => {
                    const tier = u.moduleGrants?.[m.key];
                    const canEdit = isOwner || adminModules.includes(m.key);
                    if (!canEdit) {
                      return tier ? (
                        <span key={m.key} style={pill("#f0f0f3", colors.textSecondary)}>{m.label}: {tier}</span>
                      ) : null;
                    }
                    // An org-wide Owner or Viewer sees every module read-only
                    // regardless of an explicit grant (see auth.js's
                    // requireReadAccess) — a bare "no grant" label would read
                    // as "no access at all", which isn't true for them.
                    const seesEverythingReadOnly = u.orgTier === "Owner" || u.orgTier === "Viewer";
                    return (
                      <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: colors.textSecondary }}>
                        {m.label}
                        <select
                          style={{ ...inputStyle, fontSize: 11.5, padding: "4px 6px", width: "auto" }}
                          value={tier || ""}
                          onChange={(e) => {
                            const newTier = e.target.value;
                            if (!newTier) act(() => api.removeModuleGrant(u.id, m.key));
                            else act(() => api.setModuleGrant(u.id, m.key, newTier));
                          }}
                        >
                          <option value="">{seesEverythingReadOnly ? "View only" : "No Access"}</option>
                          <option value="Viewer">Viewer</option>
                          <option value="Helper">Helper</option>
                          {isOwner && <option value="Admin">Admin</option>}
                        </select>
                      </label>
                    );
                  })}
                </div>
              ),
            },
          ]}
        />
      </div>

      {(isOwner || adminModules.includes("bell-jar")) && (
        <SignersCard
          title="GC-7Q signers"
          description="Who's authorized to sign each of the 3 signature slots on the quarterly filing — a real form requirement, separate from Bell Jar module access. A signer can be anyone in the org, regardless of their own access level."
          users={users}
          getSigners={api.getGC7QSigners}
          assignSigner={api.assignGC7QSigner}
        />
      )}
      {(isOwner || adminModules.includes("raffle")) && (
        <SignersCard
          title="Raffle (GC-7R) signers"
          description="Who's authorized to sign each of the 3 signature slots on the raffle financial statement — separate from the GC-7Q signers above, in case a different officer signs for raffle filings. A signer can be anyone in the org, regardless of their own access level."
          users={users}
          getSigners={api.getRaffleSigners}
          assignSigner={api.assignRaffleSigner}
        />
      )}
    </div>
  );
}

function InviteForm({ isOwner, adminModules, onInvited, onError, error }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", orgTier: "" });
  const [moduleTiers, setModuleTiers] = useState({});
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    onError("");
    setBusy(true);
    try {
      const moduleGrants = Object.entries(moduleTiers)
        .filter(([, tier]) => tier)
        .map(([module, tier]) => ({ module, tier }));
      const payload = { name: form.name, email: form.email, password: form.password, moduleGrants };
      if (isOwner && form.orgTier) payload.orgTier = form.orgTier;
      await api.inviteUser(payload);
      onInvited();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const editableModules = isOwner ? MODULES : MODULES.filter((m) => adminModules.includes(m.key));

  return (
    <form onSubmit={submit} style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}`, background: "#fafafa", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <Field label="Name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Temporary password"><input style={inputStyle} type="password" required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} /></Field>
        {isOwner && (
          <Field label="Org-wide tier (optional)">
            <select style={inputStyle} value={form.orgTier} onChange={(e) => set("orgTier", e.target.value)}>
              <option value="">None</option>
              <option value="Viewer">Viewer</option>
              <option value="Owner">Owner</option>
            </select>
          </Field>
        )}
      </div>

      {editableModules.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {editableModules.map((m) => (
            <Field key={m.key} label={`${m.label} access`}>
              <select
                style={inputStyle}
                value={moduleTiers[m.key] || ""}
                onChange={(e) => setModuleTiers((t) => ({ ...t, [m.key]: e.target.value }))}
              >
                <option value="">None</option>
                <option value="Viewer">Viewer</option>
                <option value="Helper">Helper</option>
                {isOwner && <option value="Admin">Admin</option>}
              </select>
            </Field>
          ))}
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={button.primary} type="submit" disabled={busy}>{busy ? "Inviting…" : "Invite"}</button>
      </div>
    </form>
  );
}

// The org's core identity — name, contact email, physical + mailing address,
// and the public slug shared across every module's public page. One
// consolidated place for
// this regardless of which modules an org has (the old home, a card buried
// inside Reports, was only reachable via the Bell Jar module's nav — an org
// running only Golf or Rentals had no way to reach it at all). Owner-only to
// edit, same as changing who else is Owner; a non-Owner still sees the
// current values read-only since it's useful org context for any admin.
function OrganizationInfoCard({ isOwner }) {
  const [org, setOrg] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", contactEmail: "", address: "", mailingAddress: "", slug: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    api.getOrg().then((o) => {
      setOrg(o);
      setForm({ name: o.name || "", contactEmail: o.contactEmail || "", address: o.address || "", mailingAddress: o.mailingAddress || "", slug: o.slug || "" });
    }).catch(() => {});
  }
  useEffect(refresh, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateOrgIdentity({ ...form, slug: form.slug.trim().toLowerCase() || null });
      setOrg(updated);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!org) return null;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 12 : 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Organization</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Your organization's name, contact info, and public link — used across every module.</div>
        </div>
        {isOwner && <button style={button.ghost} onClick={() => setEditing((s) => !s)}>{editing ? "− Cancel" : "Edit"}</button>}
      </div>

      {!editing ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
          <OrgInfoRow label="Name" value={org.name} />
          <OrgInfoRow label="Contact email" value={org.contactEmail} />
          <OrgInfoRow label="Physical address" value={org.address} />
          <OrgInfoRow label="Mailing address" value={org.mailingAddress} />
          <OrgInfoRow label="Public link" value={org.slug ? `/${org.slug}` : null} />
          {!isOwner && <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>Only an Owner can change this.</div>}
        </div>
      ) : (
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Organization name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Contact email">
            <input style={inputStyle} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="lodge@example.org" />
          </Field>
          <Field label="Physical address">
            <input style={inputStyle} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: -6 }}>Also used on buyer-facing raffle emails.</div>
          <Field label="Mailing address (optional, if different)">
            <input style={inputStyle} value={form.mailingAddress} onChange={(e) => set("mailingAddress", e.target.value)} placeholder="Same as physical address if left blank" />
          </Field>
          <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: -6 }}>This is the address that appears on your GC-7Q filing — falls back to the physical address above if left blank.</div>
          <Field label="Public link">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{window.location.origin}/…/</span>
              <input style={inputStyle} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="red-hook-lodge-2022" />
            </div>
            <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>Lowercase letters, numbers, and hyphens only — shared by Rentals, Calendar, and Golf's public pages.</div>
          </Field>
          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
          <div><button style={button.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
        </form>
      )}
    </div>
  );
}

function OrgInfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: colors.textSecondary }}>{label}</span>
      <span style={{ color: value ? colors.textPrimary : colors.textTertiary }}>{value || "—"}</span>
    </div>
  );
}

function LabelsCard({ labels, onSaved }) {
  const [form, setForm] = useState({ ownerLabel: "", viewerLabel: "", adminLabel: "", helperLabel: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      ownerLabel: labels?.ownerLabel || "",
      viewerLabel: labels?.viewerLabel || "",
      adminLabel: labels?.adminLabel || "",
      helperLabel: labels?.helperLabel || "",
    });
  }, [labels]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setBusy(true);
    try {
      await api.updateTierLabels(form);
      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Custom labels</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>
          Purely cosmetic — rename what these tiers are called in your organization (e.g. "Owner" as "Exalted Ruler"). Never changes what anyone can actually do.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Field label="Owner"><input style={inputStyle} placeholder="Owner" value={form.ownerLabel} onChange={(e) => set("ownerLabel", e.target.value)} /></Field>
        <Field label="Viewer"><input style={inputStyle} placeholder="Viewer" value={form.viewerLabel} onChange={(e) => set("viewerLabel", e.target.value)} /></Field>
        <Field label="Module Admin"><input style={inputStyle} placeholder="Chairman" value={form.adminLabel} onChange={(e) => set("adminLabel", e.target.value)} /></Field>
        <Field label="Module Helper"><input style={inputStyle} placeholder="Committee Member" value={form.helperLabel} onChange={(e) => set("helperLabel", e.target.value)} /></Field>
      </div>
      <div>
        <button style={button.primary} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save labels"}</button>
      </div>
    </div>
  );
}

// Generic Head/Preparer/Member signer-assignment card — shared by GC-7Q
// (quarterly Bell Jar) and GC-7R (raffle) filings, which each need their own
// independent set of designated signers (see RaffleSignerDesignation's
// schema comment for why they're separate tables, not shared).
function SignersCard({ title, description, users, getSigners, assignSigner }) {
  const [designations, setDesignations] = useState([]);
  const [busySlot, setBusySlot] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    getSigners().then(setDesignations).catch(() => {});
  }
  useEffect(refresh, []);

  async function assign(slot, userId) {
    setError("");
    setBusySlot(slot);
    try {
      if (userId) await assignSigner(slot, userId);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        {GC7Q_SLOTS.map((slot) => {
          const current = designations.find((d) => d.slot === slot);
          return (
            <Field key={slot} label={`${slot} slot`}>
              <select
                style={inputStyle}
                value={current?.userId || ""}
                disabled={busySlot === slot}
                onChange={(e) => assign(slot, e.target.value)}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
          );
        })}
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
    </div>
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
