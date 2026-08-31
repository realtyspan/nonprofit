import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle } from "../../lib/tokens";
import { api } from "../../lib/api";
import DataList from "../../components/DataList";
import Modal from "../../components/Modal";
import { useConfirm } from "../../lib/ConfirmContext";

// The signup dropdown's source list (and what an org's detail screen offers
// when setting/changing an org's type after the fact). Deliberately just a
// name list — which modules a category unlocks is a small hardcoded table in
// client/src/lib/modules.js, not editable here (see that file's comment).
export default function OrgCategories() {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const confirm = useConfirm();

  function refresh() {
    api.listPlatformOrgCategories().then(setCategories).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function remove(category) {
    const warning = category.orgCount > 0
      ? `Remove "${category.name}"? ${category.orgCount} organization${category.orgCount === 1 ? "" : "s"} currently set to this type will revert to "not set" — they won't be deleted or lose data, but any module restricted to this category will disappear for them until it's reassigned.`
      : `Remove "${category.name}"?`;
    if (!(await confirm(warning, { confirmLabel: "Remove" }))) return;
    setError("");
    try {
      await api.deletePlatformOrgCategory(category.id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Organization types</div>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
          The list offered at signup (and on an org's detail screen). Used to hide modules that don't apply to a given kind of organization — e.g. Elks Tools only shows for "Elks Lodge".
        </div>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {categories === null ? (
          <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>Loading…</div>
        ) : (
          <DataList
            rows={categories}
            emptyMessage="No organization types yet."
            columns={[
              { key: "name", label: "Name", grid: "1.5fr", primary: true, render: (c) => c.name },
              { key: "orgCount", label: "Organizations", grid: "1fr", render: (c) => c.orgCount },
              {
                key: "actions", label: "", footerRow: true,
                render: (c) => (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditing(c)}>Rename</button>
                    <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} onClick={() => remove(c)}>Delete</button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>

      {!showAdd ? (
        <div><button style={button.ghost} onClick={() => setShowAdd(true)}>+ Add organization type</button></div>
      ) : (
        <AddCategoryForm onCancel={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); refresh(); }} />
      )}

      {editing && (
        <RenameCategoryModal category={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
    </div>
  );
}

function AddCategoryForm({ onCancel, onAdded }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createPlatformOrgCategory(name.trim());
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>New organization type</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Elks Lodge" />
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Adding…" : "Add"}</button>
        </div>
      </form>
    </div>
  );
}

function RenameCategoryModal({ category, onCancel, onSaved }) {
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updatePlatformOrgCategory(category.id, name.trim());
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={380} title={`Rename "${category.name}"`}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
