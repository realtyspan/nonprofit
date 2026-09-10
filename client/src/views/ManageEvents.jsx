import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";
import { resizeImageFile } from "../lib/imageResize";
import { hasModuleTier } from "../lib/modules";
import { formatPhone, stripPhone } from "../lib/phone";
import DataList from "../components/DataList";
import Modal from "../components/Modal";
import AdminAccessNotice from "../components/AdminAccessNotice";

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusStyle(status) {
  if (status === "published") return [colors.successBg, colors.success];
  if (status === "cancelled") return [colors.dangerBg, colors.danger];
  return ["#f1ece0", colors.textSecondary]; // draft
}

export default function ManageEvents({ permissions }) {
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // event being edited, or {} for new
  const [deleting, setDeleting] = useState(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(null); // event id currently transitioning
  const [lifecycleError, setLifecycleError] = useState("");

  function refresh() {
    api.listEvents().then((rows) => { setEvents(rows); setLoaded(true); }).catch(() => setLoaded(true));
  }
  useEffect(refresh, []);

  // A Helper on this module can see every event (read access is granted by
  // holding any grant at all — see requireReadAccess("events") server-side),
  // but creating/editing/publishing/cancelling/deleting is Admin-only —
  // never an Owner bypass, see server/src/lib/auth.js's requirePermission.
  // hasModuleTier() (client/src/lib/modules.js) is the one correct check for
  // this — it deliberately does NOT give Owner a free pass either, so this
  // stays in lockstep with what the server actually enforces instead of
  // letting someone fill out a whole form only to be 403'd at the end.
  const canManage = hasModuleTier(permissions, "events", "Admin");

  async function transition(event, action) {
    setLifecycleBusy(event.id);
    setLifecycleError("");
    try {
      if (action === "publish") await api.publishEvent(event.id);
      else if (action === "unpublish") await api.unpublishEvent(event.id);
      else if (action === "cancel") await api.cancelEvent(event.id);
      refresh();
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setLifecycleBusy(null);
    }
  }

  async function deleteEvent() {
    setLifecycleBusy(deleting.id);
    setLifecycleError("");
    try {
      await api.deleteEvent(deleting.id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setLifecycleBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AdminAccessNotice permissions={permissions} moduleKey="events" moduleLabel="Events" itemLabel="an event" />

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Events</div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Create, publish, and manage your public events.</div>
          </div>
          <button
            style={canManage ? button.primary : button.disabled}
            disabled={!canManage}
            title={!canManage ? "Only an Events Admin can create an event" : ""}
            onClick={() => setEditing({})}
          >
            + New event
          </button>
        </div>

        {lifecycleError && <div style={{ padding: "10px 18px 0", color: colors.danger, fontSize: 12.5, fontWeight: 600 }}>{lifecycleError}</div>}

        {loaded && (
          <DataList
            rows={events}
            emptyMessage="No events yet — create your first one above."
            columns={[
              {
                key: "title", label: "Event", grid: "1.8fr", primary: true,
                render: (e) => (
                  <>
                    <div style={{ fontWeight: 600 }}>{e.title}</div>
                    {e.location && <div style={{ fontSize: 11.5, fontWeight: 400, color: colors.textSecondary, marginTop: 1 }}>{e.location}</div>}
                  </>
                ),
              },
              {
                key: "when", label: "When", grid: "1.3fr",
                render: (e) => new Date(e.startAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: e.allDay ? undefined : "short" }),
              },
              { key: "status", label: "Status", grid: "0.8fr", render: (e) => <span style={pill(...statusStyle(e.status))}>{e.status}</span> },
              {
                key: "actions", label: "", grid: "1.8fr", footerRow: true,
                render: (e) => {
                  const busy = lifecycleBusy === e.id;
                  return (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} disabled={!canManage} title={!canManage ? "Only an Events Admin can edit an event" : ""} onClick={() => setEditing(e)}>Edit</button>
                      {e.status !== "published" && e.status !== "cancelled" && (
                        <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} disabled={busy || !canManage} title={!canManage ? "Only an Events Admin can publish an event" : ""} onClick={() => transition(e, "publish")}>Publish</button>
                      )}
                      {e.status === "published" && (
                        <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} disabled={busy || !canManage} title={!canManage ? "Only an Events Admin can unpublish an event" : ""} onClick={() => transition(e, "unpublish")}>Unpublish</button>
                      )}
                      {e.status !== "cancelled" && (
                        <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} disabled={busy || !canManage} title={!canManage ? "Only an Events Admin can cancel an event" : ""} onClick={() => transition(e, "cancel")}>Cancel</button>
                      )}
                      <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: colors.danger }} disabled={busy || !canManage} title={!canManage ? "Only an Events Admin can delete an event" : ""} onClick={() => setDeleting(e)}>Delete</button>
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </div>

      {editing && (
        <EventModal
          event={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}

      {deleting && (
        <Modal onCancel={() => setDeleting(null)} width={420}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Delete “{deleting.title}”?</div>
            <div style={{ fontSize: 13, color: colors.textSecondary }}>
              This permanently removes the event and its listing on your Calendar. This can't be undone.
            </div>
            {lifecycleError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{lifecycleError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={button.ghost} onClick={() => setDeleting(null)}>Cancel</button>
              <button style={{ ...button.primary, background: colors.danger }} disabled={lifecycleBusy === deleting.id} onClick={deleteEvent}>
                {lifecycleBusy === deleting.id ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const EVENT_IMAGE_TARGET_CHARS = 500000; // leaves headroom under events.js's MAX_EVENT_IMAGE_CHARS
const EVENT_IMAGE_QUALITY_STEPS = [0.82, 0.65, 0.5];

async function resizeEventImage(file, maxDim) {
  let dataUrl;
  for (const quality of EVENT_IMAGE_QUALITY_STEPS) {
    dataUrl = await resizeImageFile(file, maxDim, quality);
    if (dataUrl.length <= EVENT_IMAGE_TARGET_CHARS) return dataUrl;
  }
  throw new Error("That photo is too large even compressed — try a smaller or simpler image");
}

function EventModal({ event, onCancel, onSaved }) {
  const isNew = !event.id;
  const [form, setForm] = useState({
    title: event.title || "",
    shortTitle: event.shortTitle || "",
    tagline: event.tagline || "",
    description: event.description || "",
    location: event.location || "",
    startAt: toLocalInputValue(event.startAt) || "",
    endAt: toLocalInputValue(event.endAt) || "",
    allDay: event.allDay || false,
    recurrenceLabel: event.recurrenceLabel || "",
    heroImage: event.heroImage || "",
    secondaryImage: event.secondaryImage || "",
    price: event.price || "",
    priceUnit: event.priceUnit || "",
    payUrl: event.payUrl || "",
    reservePhone: event.reservePhone || "",
    statusNote: event.statusNote || "",
    admissionNote: event.admissionNote || "",
    includesHeading: event.includesHeading || "",
    includes: (event.includes && event.includes.length > 0 ? event.includes : [""]),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setIncludeAt(i, v) {
    setForm((f) => {
      const includes = [...f.includes];
      includes[i] = v;
      return { ...f, includes };
    });
  }
  function addIncludeRow() {
    setForm((f) => ({ ...f, includes: [...f.includes, ""] }));
  }
  function removeIncludeRow(i) {
    setForm((f) => ({ ...f, includes: f.includes.filter((_, idx) => idx !== i) }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        ...form,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
        endAt: form.endAt ? new Date(form.endAt).toISOString() : "",
      };
      if (isNew) await api.createEvent(payload);
      else await api.updateEvent(event.id, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={640}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "80vh", overflowY: "auto", paddingRight: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{isNew ? "New event" : `Edit “${event.title}”`}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <Field label="Title"><input style={inputStyle} required value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Short title (optional)"><input style={inputStyle} value={form.shortTitle} onChange={(e) => set("shortTitle", e.target.value)} /></Field>
        </div>
        <Field label="Tagline (one sentence, shown under the title)">
          <input style={inputStyle} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="A slow-smoked lodge tradition, back for another season." />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <Field label="Starts"><input style={inputStyle} type="datetime-local" required value={form.startAt} onChange={(e) => set("startAt", e.target.value)} /></Field>
          <Field label="Ends"><input style={inputStyle} type="datetime-local" value={form.endAt} onChange={(e) => set("endAt", e.target.value)} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <input type="checkbox" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} />
            All day
          </label>
          <Field label="Location"><input style={inputStyle} value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
        </div>
        <Field label="Recurrence label (optional display text — not a real repeat schedule)">
          <input style={inputStyle} value={form.recurrenceLabel} onChange={(e) => set("recurrenceLabel", e.target.value)} placeholder="Monthly · Second Saturday" />
        </Field>

        <Section title="Photos">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <EventPhotoField label="Hero photo (optional)" hint="Shown large at the top of the event page." image={form.heroImage} maxDim={1400} aspect="4/3" onChange={(img) => set("heroImage", img)} />
            <EventPhotoField label="Second photo (optional)" hint="Shown beside the description." image={form.secondaryImage} maxDim={1200} aspect="1/1" onChange={(img) => set("secondaryImage", img)} />
          </div>
        </Section>

        <Section title="Price & payment">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <Field label="Price (plain text)"><input style={inputStyle} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="$25 or Free" /></Field>
            <Field label="Price unit"><input style={inputStyle} value={form.priceUnit} onChange={(e) => set("priceUnit", e.target.value)} placeholder="per meal · cash or card" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 10 }}>
            <Field label="Pay online link (optional)"><input style={inputStyle} type="url" value={form.payUrl} onChange={(e) => set("payUrl", e.target.value)} placeholder="https://venmo.com/..." /></Field>
            <Field label="Reserve by phone (optional)"><input style={inputStyle} type="tel" value={formatPhone(form.reservePhone)} onChange={(e) => set("reservePhone", stripPhone(e.target.value))} /></Field>
          </div>
          <Field label="Admission note (short line under the actions)">
            <input style={inputStyle} value={form.admissionNote} onChange={(e) => set("admissionNote", e.target.value)} placeholder="Members and guests welcome." />
          </Field>
        </Section>

        <Section title="Details">
          <Field label="Status note (short line under the date)">
            <input style={inputStyle} value={form.statusNote} onChange={(e) => set("statusNote", e.target.value)} placeholder="Rain or shine — under the pavilion." />
          </Field>
          <Field label="Includes heading">
            <input style={inputStyle} value={form.includesHeading} onChange={(e) => set("includesHeading", e.target.value)} placeholder="On the plate" />
          </Field>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#5c564c" }}>Includes list</span>
            {form.includes.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <input style={inputStyle} value={item} onChange={(e) => setIncludeAt(i, e.target.value)} placeholder="Pulled pork, sides, and dessert" />
                <button type="button" style={{ ...button.ghost, padding: "6px 10px", fontSize: 12 }} onClick={() => removeIncludeRow(i)}>Remove</button>
              </div>
            ))}
            <button type="button" style={{ ...button.ghost, padding: "6px 10px", fontSize: 12, alignSelf: "flex-start" }} onClick={addIncludeRow}>+ Add item</button>
          </div>
          <Field label="Description">
            <textarea style={{ ...inputStyle, minHeight: 90, fontFamily: "inherit" }} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </Section>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
          <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save event"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EventPhotoField({ label, hint, image, maxDim, aspect, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Attach an image file");
      return;
    }
    setError("");
    setBusy(true);
    try {
      onChange(await resizeEventImage(file, maxDim));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5c564c" }}>{label}</div>
      <div style={{ fontSize: 11, color: colors.textSecondary }}>{hint}</div>
      {image && (
        <img
          src={image} alt=""
          style={{ width: "100%", aspectRatio: aspect, objectFit: "cover", borderRadius: 8, border: `1px solid ${colors.border}` }}
        />
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ cursor: "pointer" }}>
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
          <span style={{ ...button.ghost, display: "inline-block", padding: "6px 12px", fontSize: 12.5 }}>
            {busy ? "Uploading…" : image ? "Replace photo" : "Add photo"}
          </span>
        </label>
        {image && !busy && (
          <button type="button" style={{ ...button.ghost, padding: "6px 10px", fontSize: 12.5, color: colors.danger }} onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 11.5 }}>{error}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: colors.textSecondary }}>{title}</div>
      {children}
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
