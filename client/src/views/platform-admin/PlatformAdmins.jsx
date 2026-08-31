import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../../lib/tokens";
import { api } from "../../lib/api";
import DataList from "../../components/DataList";
import { useConfirm } from "../../lib/ConfirmContext";

const ROLE_STYLE = {
  Owner: [colors.indigoBg, colors.indigo],
  Support: [colors.successBg, colors.success],
};

export default function PlatformAdmins({ myRole }) {
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const isOwner = myRole === "Owner";
  const confirm = useConfirm();

  function refresh() {
    api.listPlatformAdmins().then(setAdmins).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function changeRole(admin, platformRole) {
    setError("");
    try {
      await api.updatePlatformAdminRole(admin.id, platformRole);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function revoke(admin) {
    if (!(await confirm(`Revoke platform-admin access for ${admin.name}? They'll keep their account and login, just lose access to this dashboard.`, { confirmLabel: "Revoke" }))) return;
    setError("");
    try {
      await api.revokePlatformAdmin(admin.id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Platform admins</div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
          Everyone with access to this dashboard. {isOwner ? "As an Owner, you can add, change, or revoke access." : "Only an Owner can add, change, or revoke access."}
        </div>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {admins === null ? (
          <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>Loading…</div>
        ) : (
          <DataList
            rows={admins}
            emptyMessage="No platform admins."
            columns={[
              { key: "name", label: "Name", grid: "1.2fr", primary: true, render: (a) => a.name },
              { key: "email", label: "Email", grid: "1.4fr", render: (a) => a.email },
              { key: "org", label: "Home org", grid: "1.2fr", render: (a) => a.orgName },
              {
                key: "role", label: "Role", grid: "0.9fr",
                render: (a) => {
                  const [bg, text] = ROLE_STYLE[a.platformRole] || ["#f1ece0", colors.textSecondary];
                  return <span style={pill(bg, text)}>{a.platformRole}</span>;
                },
              },
              ...(isOwner
                ? [{
                    key: "actions", label: "", footerRow: true,
                    render: (a) => (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }}
                          onClick={() => changeRole(a, a.platformRole === "Owner" ? "Support" : "Owner")}
                        >
                          Make {a.platformRole === "Owner" ? "Support" : "Owner"}
                        </button>
                        <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={() => revoke(a)}>
                          Revoke
                        </button>
                      </div>
                    ),
                  }]
                : []),
            ]}
          />
        )}
      </div>

      {isOwner && (
        !showAdd ? (
          <div><button style={button.ghost} onClick={() => setShowAdd(true)}>+ Add platform admin</button></div>
        ) : (
          <AddAdminForm onCancel={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); refresh(); }} />
        )
      )}
    </div>
  );
}

function AddAdminForm({ onCancel, onAdded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [platformRole, setPlatformRole] = useState("Support");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createPlatformAdmin({ name: name.trim(), email: email.trim(), password, platformRole });
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, maxWidth: 440 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>New platform admin</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Name"><input style={inputStyle} required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Initial password"><input style={inputStyle} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></Field>
        <Field label="Role">
          <select style={inputStyle} value={platformRole} onChange={(e) => setPlatformRole(e.target.value)}>
            <option value="Support">Support</option>
            <option value="Owner">Owner</option>
          </select>
        </Field>
        <div style={{ fontSize: 11.5, color: colors.textSecondary }}>
          Share the email and password with them directly — there's no invite email, same as adding a teammate elsewhere in the app.
        </div>
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Adding…" : "Add platform admin"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#5c564c" }}>
      {label}
      {children}
    </label>
  );
}
