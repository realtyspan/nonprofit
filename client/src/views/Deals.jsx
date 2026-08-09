import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";
import { resizeImageFile } from "../lib/imageResize";

function formatPct(fraction) {
  return `${Math.round((fraction ?? 0.75) * 100)}%`;
}

export default function Deals({ deals, onChanged, permissions }) {
  const isBellJarAdmin = permissions?.moduleGrants?.["bell-jar"] === "Admin";
  const [history, setHistory] = useState([]);
  const [closing, setClosing] = useState(null); // deal being closed
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState("");
  const [activatingId, setActivatingId] = useState(null);
  const [editingDeal, setEditingDeal] = useState(null);

  function refreshHistory() {
    api.listSchedule1().then(setHistory).catch(() => {});
  }

  useEffect(refreshHistory, []);

  const received = deals.filter((d) => d.status === "received");
  const active = deals.filter((d) => d.status === "active");
  const cols = "2fr 1fr 1fr 1fr auto";

  async function activate(dealId) {
    setActivatingId(dealId);
    try {
      await api.activateDeal(dealId);
      onChanged();
    } catch (err) {
      alert(err.message);
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Game inventory</div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Logged when a game is received; activate it once it's loaded onto the machine.</div>
          </div>
          <button style={button.ghost} onClick={() => setShowAddForm((s) => !s)}>{showAddForm ? "− Cancel" : "+ Log new game"}</button>
        </div>

        {showAddForm && <AddGameForm onCancel={() => setShowAddForm(false)} onError={setAddError} onCreated={() => { setShowAddForm(false); setAddError(""); onChanged(); }} error={addError} />}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Game</div>
          <div>Ticket count</div>
          <div>Ticket price</div>
          <div>Ideal payout</div>
          <div>Close threshold</div>
          <div></div>
        </div>
        {received.map((d) => (
          <div key={d.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", padding: "12px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, fontFamily: mono, color: colors.textTertiary }}>{d.formNum} · {d.serialNum}</div>
            </div>
            <div style={{ fontFamily: mono }}>{d.ticketCount.toLocaleString()}</div>
            <div style={{ fontFamily: mono }}>{money(d.ticketPrice)}</div>
            <div style={{ fontFamily: mono }}>{money(d.idealPayout)}</div>
            <div style={{ fontFamily: mono }}>{formatPct(d.closeThreshold)}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={button.ghost} onClick={() => setEditingDeal(d)}>Edit</button>
              <button style={button.primary} disabled={activatingId === d.id} onClick={() => activate(d.id)}>
                {activatingId === d.id ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        ))}
        {received.length === 0 && !showAddForm && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No games waiting on inventory.</div>}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>Open deals</div>
        <div style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Deal</div>
          <div>Tickets sold / total</div>
          <div>Prizes awarded</div>
          <div>Threshold</div>
          <div></div>
        </div>
        {active.map((d) => (
          <div key={d.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 18px", alignItems: "center", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13.5 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, fontFamily: mono, color: colors.textTertiary }}>{d.formNum} · {d.serialNum}</div>
            </div>
            <div style={{ fontFamily: mono }}>{d.soldToDate.toLocaleString()} / {d.ticketCount.toLocaleString()}</div>
            <div style={{ fontFamily: mono }}>{(d.prizePercent * 100).toFixed(1)}%</div>
            <div>
              {d.eligibleToClose ? (
                <span style={pill(colors.warningBg, colors.warning)}>≥{formatPct(d.closeThreshold)} eligible</span>
              ) : (
                <span style={pill("#f0f0f3", colors.textSecondary)}>Below {formatPct(d.closeThreshold)} threshold</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={button.ghost} onClick={() => setEditingDeal(d)}>Edit</button>
              <button
                style={d.eligibleToClose && isBellJarAdmin ? button.primary : button.disabled}
                disabled={!d.eligibleToClose || !isBellJarAdmin}
                title={!isBellJarAdmin ? "Only a Bell Jar Admin can close a deal" : !d.eligibleToClose ? `Deal must reach ${formatPct(d.closeThreshold)} of ideal prize payout` : ""}
                onClick={() => setClosing(d)}
              >
                Close deal
              </button>
            </div>
          </div>
        ))}
        {active.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No open deals.</div>}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>Schedule 1 — closed-deal history</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1.2fr", padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          <div>Deal</div>
          <div>Closed date</div>
          <div>Prizes (M)</div>
          <div>Unsold value (O)</div>
          <div>Profit (P)</div>
          <div>Retention until</div>
        </div>
        {history.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1.2fr", padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13, fontFamily: mono }}>
            <div style={{ fontFamily: "inherit", fontWeight: 600 }}>{r.deal?.name}</div>
            <div>{new Date(r.closedDate).toLocaleDateString()}</div>
            <div>{money(r.cashPrizes + r.otherPrizes)}</div>
            <div>{money(r.unsoldValue)}</div>
            <div style={{ color: r.actualProfit >= 0 ? colors.success : colors.danger, fontWeight: 600 }}>{money(r.actualProfit)}</div>
            <div>{new Date(r.retentionUntil).toLocaleDateString()}</div>
          </div>
        ))}
        {history.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No deals closed yet.</div>}
      </div>

      {closing && (
        <CloseDealModal
          deal={closing}
          onCancel={() => { setClosing(null); setError(""); }}
          onConfirm={async (unsoldCount) => {
            setError("");
            try {
              await api.closeDeal(closing.id, unsoldCount);
              setClosing(null);
              onChanged();
              refreshHistory();
            } catch (err) {
              setError(err.message);
            }
          }}
          error={error}
        />
      )}

      {editingDeal && (
        <EditGameModal
          deal={editingDeal}
          onCancel={() => setEditingDeal(null)}
          onSaved={() => {
            setEditingDeal(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function CloseDealModal({ deal, onCancel, onConfirm, error }) {
  const [unsoldCount, setUnsoldCount] = useState("");
  const N = Number(unsoldCount) || 0;
  const I = deal.ticketCount * deal.ticketPrice;
  const M = deal.prizesAwardedToDate;
  const O = N * deal.ticketPrice;
  const P = I - M - O;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 420, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Close “{deal.name}”</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>Enter the physical unsold ticket count to compute final profit.</div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "#52525b", marginBottom: 14 }}>
          Unsold ticket count (N)
          <input style={inputStyle} type="number" min="0" max={deal.ticketCount} value={unsoldCount} onChange={(e) => setUnsoldCount(e.target.value)} autoFocus />
        </label>

        <div style={{ background: "#fafafa", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontFamily: mono, marginBottom: 16 }}>
          <Row label="Ideal ticket value (I)" value={money(I)} />
          <Row label="Prizes awarded (M)" value={money(M)} />
          <Row label="Unsold value (O)" value={money(O)} />
          <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700, color: P >= 0 ? colors.success : colors.danger }}>
            <span>Actual profit (P)</span>
            <span>{money(P)}</span>
          </div>
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={button.ghost} onClick={onCancel}>Cancel</button>
          <button style={button.primary} onClick={() => onConfirm(N)} disabled={!unsoldCount}>Confirm close &amp; archive</button>
        </div>
      </div>
    </div>
  );
}

// Lets the user photograph a game's printed label instead of retyping it —
// the photo is resized client-side before it's sent anywhere, then handed to
// AI extraction (if onScanned is provided) to pre-fill the surrounding form.
// The scan only ever pre-fills fields; nothing is saved until the user
// reviews and submits the form themselves.
function LabelPhotoField({ image, onImageChange, onScanned }) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanError("");
    try {
      const dataUrl = await resizeImageFile(file);
      onImageChange(dataUrl);
      if (onScanned) {
        setScanning(true);
        try {
          onScanned(await api.scanGameLabel(dataUrl));
        } catch (err) {
          setScanError(err.message);
        } finally {
          setScanning(false);
        }
      }
    } catch (err) {
      setScanError(err.message);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {image && (
        <img src={image} alt="Game label" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: `1px solid ${colors.border}` }} />
      )}
      <label style={{ cursor: "pointer" }}>
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
        <span style={{ ...button.ghost, display: "inline-block", padding: "6px 12px", fontSize: 12.5 }}>
          {scanning ? "Scanning label…" : image ? "Replace label photo" : "Scan label photo"}
        </span>
      </label>
      {scanError && <span style={{ color: colors.danger, fontSize: 11.5 }}>{scanError}</span>}
    </div>
  );
}

function AddGameForm({ onCancel, onCreated, onError, error }) {
  const [form, setForm] = useState({ name: "", serialNum: "", formNum: "", ticketCount: "", ticketPrice: "", idealPayout: "", closeThresholdPct: "75", labelImage: "" });
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function applyScan(fields) {
    setForm((f) => ({
      ...f,
      name: fields.name ?? f.name,
      formNum: fields.formNum ?? f.formNum,
      serialNum: fields.serialNum ?? f.serialNum,
      ticketCount: fields.ticketCount ?? f.ticketCount,
      ticketPrice: fields.ticketPrice ?? f.ticketPrice,
      idealPayout: fields.idealPayout ?? f.idealPayout,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    onError("");
    setBusy(true);
    try {
      await api.createDeal({
        ...form,
        ticketCount: Number(form.ticketCount),
        ticketPrice: Number(form.ticketPrice),
        idealPayout: Number(form.idealPayout),
        closeThreshold: Number(form.closeThresholdPct) / 100,
      });
      onCreated();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}`, background: "#fafafa", display: "flex", flexDirection: "column", gap: 10 }}>
      <LabelPhotoField image={form.labelImage} onImageChange={(img) => set("labelImage", img)} onScanned={applyScan} />
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.9fr 0.8fr 0.8fr 0.8fr 0.9fr auto", gap: 10, alignItems: "end" }}>
        <Field label="Game name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Form #"><input style={inputStyle} required value={form.formNum} onChange={(e) => set("formNum", e.target.value)} /></Field>
        <Field label="Serial #"><input style={inputStyle} required value={form.serialNum} onChange={(e) => set("serialNum", e.target.value)} /></Field>
        <Field label="Ticket count"><input style={inputStyle} type="number" min="1" required value={form.ticketCount} onChange={(e) => set("ticketCount", e.target.value)} /></Field>
        <Field label="Ticket price"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} /></Field>
        <Field label="Ideal payout"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.idealPayout} onChange={(e) => set("idealPayout", e.target.value)} /></Field>
        <Field label="Close at %"><input style={inputStyle} type="number" min="75" max="100" step="1" required value={form.closeThresholdPct} onChange={(e) => set("closeThresholdPct", e.target.value)} /></Field>
        <button style={button.primary} type="submit" disabled={busy}>{busy ? "Saving…" : "Log game"}</button>
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}
    </form>
  );
}

function EditGameModal({ deal, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: deal.name,
    serialNum: deal.serialNum,
    formNum: deal.formNum,
    ticketCount: deal.ticketCount,
    ticketPrice: deal.ticketPrice,
    idealPayout: deal.idealPayout,
    closeThresholdPct: Math.round((deal.closeThreshold ?? 0.75) * 100),
    labelImage: deal.labelImage || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function applyScan(fields) {
    setForm((f) => ({
      ...f,
      name: fields.name ?? f.name,
      formNum: fields.formNum ?? f.formNum,
      serialNum: fields.serialNum ?? f.serialNum,
      ticketCount: fields.ticketCount ?? f.ticketCount,
      ticketPrice: fields.ticketPrice ?? f.ticketPrice,
      idealPayout: fields.idealPayout ?? f.idealPayout,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.updateDeal(deal.id, {
        ...form,
        ticketCount: Number(form.ticketCount),
        ticketPrice: Number(form.ticketPrice),
        idealPayout: Number(form.idealPayout),
        closeThreshold: Number(form.closeThresholdPct) / 100,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: 460, background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Correct “{deal.name}”</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
          {deal.status === "active" && deal.soldToDate > 0
            ? `Corrections here won't touch the ${deal.soldToDate.toLocaleString()} tickets and ${money(deal.prizesAwardedToDate)} in prizes already recorded.`
            : "Fix any details logged in error before this game goes on the machine."}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <LabelPhotoField image={form.labelImage} onImageChange={(img) => set("labelImage", img)} onScanned={applyScan} />
          <Field label="Game name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Form #"><input style={inputStyle} required value={form.formNum} onChange={(e) => set("formNum", e.target.value)} /></Field>
            <Field label="Serial #"><input style={inputStyle} required value={form.serialNum} onChange={(e) => set("serialNum", e.target.value)} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Ticket count">
              <input style={inputStyle} type="number" min={deal.soldToDate || 1} required value={form.ticketCount} onChange={(e) => set("ticketCount", e.target.value)} />
            </Field>
            <Field label="Ticket price"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} /></Field>
            <Field label="Ideal payout"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.idealPayout} onChange={(e) => set("idealPayout", e.target.value)} /></Field>
          </div>
          <Field label="Close threshold %">
            <input style={inputStyle} type="number" min="75" max="100" step="1" required value={form.closeThresholdPct} onChange={(e) => set("closeThresholdPct", e.target.value)} />
          </Field>
          <div style={{ fontSize: 11.5, color: colors.textSecondary }}>
            75% is the NYS minimum before this deal can be closed — set higher only if the org wants a stricter bar.
          </div>
          {deal.soldToDate > 0 && (
            <div style={{ fontSize: 11.5, color: colors.textSecondary }}>Ticket count can't go below the {deal.soldToDate.toLocaleString()} already sold.</div>
          )}

          {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button type="button" style={button.ghost} onClick={onCancel}>Cancel</button>
            <button type="submit" style={button.primary} disabled={busy}>{busy ? "Saving…" : "Save corrections"}</button>
          </div>
        </form>
      </div>
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

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: colors.textSecondary, fontFamily: "Inter, sans-serif" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
