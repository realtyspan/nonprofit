import React, { useEffect, useState } from "react";
import { colors, card, pill, button, input as inputStyle, money, mono } from "../lib/tokens";
import { api } from "../lib/api";
import { icons } from "../lib/icons";
import { resizeImageFile } from "../lib/imageResize";
import DataList from "../components/DataList";
import Modal from "../components/Modal";
import { useIsMobile } from "../lib/viewport";

function formatPct(fraction) {
  return `${Math.round((fraction ?? 0.75) * 100)}%`;
}

export default function Deals({ deals, onChanged, permissions }) {
  const isMobile = useIsMobile();
  const isBellJarAdmin = permissions?.moduleGrants?.["bell-jar"] === "Admin";
  const [history, setHistory] = useState([]);
  const [closing, setClosing] = useState(null); // deal being closed
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState("");
  const [activatingId, setActivatingId] = useState(null);
  const [editingDeal, setEditingDeal] = useState(null);
  const [deleting, setDeleting] = useState(null); // deal pending delete confirmation
  const [deleteError, setDeleteError] = useState("");
  const [historyFrom, setHistoryFrom] = useState(""); // "" = no lower bound
  const [historyTo, setHistoryTo] = useState(""); // "" = no upper bound
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState("");

  function refreshHistory() {
    api.listSchedule1().then(setHistory).catch(() => {});
  }

  useEffect(refreshHistory, []);

  const received = deals.filter((d) => d.status === "received");
  const active = deals.filter((d) => d.status === "active");

  // Client-side, unlike the Worksheet's own date filter — a game only closes
  // once, so an org's whole closed-game history is small enough (unlike
  // hundreds of daily worksheet rows) that filtering the already-fetched
  // list needs no separate server round trip. Defaults to no bound at all
  // (not a rolling window like the Worksheet) since closures happen rarely
  // enough that a 90-day default could easily hide everything an org has.
  const filteredHistory = history.filter((r) => {
    const closed = new Date(r.closedDate);
    if (historyFrom && closed < new Date(historyFrom)) return false;
    if (historyTo && closed > new Date(`${historyTo}T23:59:59.999`)) return false;
    return true;
  });

  function resetHistoryFilters() {
    setHistoryFrom("");
    setHistoryTo("");
  }

  // Prints exactly the filtered closed-date range shown on screen — same
  // reasoning as the Sales Worksheet's Print report button: some members
  // will only ever see a paper copy of this. The server independently
  // re-queries by the same from/to rather than trusting client-side rows.
  async function printSchedule1Report() {
    setPrintBusy(true);
    setPrintError("");
    try {
      await api.downloadSchedule1Report({ from: historyFrom || undefined, to: historyTo || undefined });
    } catch (err) {
      setPrintError(err.message);
    } finally {
      setPrintBusy(false);
    }
  }

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
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Game inventory</div>
            <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Logged when a game is received; activate it once it's loaded onto the machine.</div>
          </div>
          <button style={button.ghost} onClick={() => setShowAddForm((s) => !s)}>{showAddForm ? "− Cancel" : "+ Log new game"}</button>
        </div>

        {showAddForm && <AddGameForm onCancel={() => setShowAddForm(false)} onError={setAddError} onCreated={() => { setShowAddForm(false); setAddError(""); onChanged(); }} error={addError} />}

        {!(showAddForm && received.length === 0) && <DataList
          rows={received}
          emptyMessage="No games waiting on inventory."
          columns={[
            {
              key: "game", label: "Game", grid: "2fr", primary: true,
              render: (d) => (
                <>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 400, fontFamily: mono, color: colors.textTertiary }}>{d.formNum} · {d.serialNum}</div>
                </>
              ),
            },
            { key: "ticketCount", label: "Ticket count", grid: "1fr", render: (d) => <div style={{ fontFamily: mono }}>{d.ticketCount.toLocaleString()}</div> },
            { key: "ticketPrice", label: "Ticket price", grid: "1fr", render: (d) => <div style={{ fontFamily: mono }}>{money(d.ticketPrice)}</div> },
            { key: "idealPayout", label: "Ideal payout", grid: "1fr", render: (d) => <div style={{ fontFamily: mono }}>{money(d.idealPayout)}</div> },
            { key: "closeThreshold", label: "Close threshold", grid: "1fr", render: (d) => <div style={{ fontFamily: mono }}>{formatPct(d.closeThreshold)}</div> },
            {
              key: "actions", label: "", footerRow: true,
              render: (d) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={button.ghost} onClick={() => setEditingDeal(d)}>Edit</button>
                  <button style={button.primary} disabled={activatingId === d.id} onClick={() => activate(d.id)}>
                    {activatingId === d.id ? "Activating…" : "Activate"}
                  </button>
                  <button
                    style={isBellJarAdmin ? { ...button.ghost, color: colors.danger } : button.disabled}
                    disabled={!isBellJarAdmin}
                    title={!isBellJarAdmin ? "Only a Bell Jar Admin can delete a game" : ""}
                    onClick={() => { setDeleteError(""); setDeleting(d); }}
                  >
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
        />}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${colors.borderLight}` }}>Open games</div>
        <DataList
          rows={active}
          emptyMessage="No open games."
          columns={[
            {
              key: "deal", label: "Game", grid: "2fr", primary: true,
              render: (d) => (
                <>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 400, fontFamily: mono, color: colors.textTertiary }}>{d.formNum} · {d.serialNum}</div>
                </>
              ),
            },
            { key: "sold", label: "Tickets sold / total", grid: "1fr", render: (d) => <div style={{ fontFamily: mono }}>{d.soldToDate.toLocaleString()} / {d.ticketCount.toLocaleString()}</div> },
            { key: "prizes", label: "Prizes awarded", grid: "1fr", render: (d) => <div style={{ fontFamily: mono }}>{(d.prizePercent * 100).toFixed(1)}%</div> },
            {
              key: "threshold", label: "Threshold", grid: "1fr",
              render: (d) => d.eligibleToClose ? (
                <span style={pill(colors.warningBg, colors.warning)}>≥{formatPct(d.closeThreshold)} eligible</span>
              ) : (
                <span style={pill("#f1ece0", colors.textSecondary)}>Below {formatPct(d.closeThreshold)} threshold</span>
              ),
            },
            {
              key: "actions", label: "", footerRow: true,
              render: (d) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={button.ghost} onClick={() => setEditingDeal(d)}>Edit</button>
                  <button
                    style={d.eligibleToClose && isBellJarAdmin ? button.primary : button.disabled}
                    disabled={!d.eligibleToClose || !isBellJarAdmin}
                    title={!isBellJarAdmin ? "Only a Bell Jar Admin can close a game" : !d.eligibleToClose ? `Game must reach ${formatPct(d.closeThreshold)} of ideal prize payout` : ""}
                    onClick={() => setClosing(d)}
                  >
                    Close game
                  </button>
                  <button
                    style={isBellJarAdmin ? { ...button.ghost, color: colors.danger } : button.disabled}
                    disabled={!isBellJarAdmin}
                    title={!isBellJarAdmin ? "Only a Bell Jar Admin can delete a game" : ""}
                    onClick={() => { setDeleteError(""); setDeleting(d); }}
                  >
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, alignSelf: isMobile ? "flex-start" : "flex-end" }}>Schedule 1 — closed-game history</div>
          <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row", gap: 10, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: colors.textSecondary, alignSelf: isMobile ? "flex-start" : "flex-end", paddingBottom: isMobile ? 0 : 8 }}>
              <span dangerouslySetInnerHTML={{ __html: icons.filter }} style={{ width: 14, height: 14, display: "flex" }} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Filters</span>
            </div>
            <Field label="Closed from">
              <input style={{ ...inputStyle, width: isMobile ? "100%" : 145 }} type="date" value={historyFrom} max={historyTo || undefined} onChange={(e) => setHistoryFrom(e.target.value)} />
            </Field>
            <Field label="Closed to">
              <input style={{ ...inputStyle, width: isMobile ? "100%" : 145 }} type="date" value={historyTo} min={historyFrom || undefined} onChange={(e) => setHistoryTo(e.target.value)} />
            </Field>
            <button style={button.ghost} onClick={resetHistoryFilters}>Reset</button>
            {/* Prints exactly this filtered closed-date range as a formatted
                PDF — for members who'll only ever see a paper copy of this
                history, not the screen itself. */}
            <button style={button.secondary} onClick={printSchedule1Report} disabled={printBusy || filteredHistory.length === 0}>
              {printBusy ? "Preparing…" : "Print report (PDF)"}
            </button>
          </div>
        </div>
        {printError && <div style={{ padding: "10px 18px 0", color: colors.danger, fontSize: 12.5, fontWeight: 600 }}>{printError}</div>}
        <DataList
          rows={filteredHistory}
          emptyMessage={history.length === 0 ? "No games closed yet." : "No closed games in this date range."}
          columns={[
            { key: "deal", label: "Game", grid: "1.6fr", primary: true, render: (r) => <div style={{ fontWeight: 600 }}>{r.deal?.name}</div> },
            { key: "closedDate", label: "Closed date", grid: "1fr", render: (r) => <div style={{ fontFamily: mono, fontSize: 13 }}>{new Date(r.closedDate).toLocaleDateString()}</div> },
            { key: "prizes", label: "Prizes (M)", grid: "1fr", render: (r) => <div style={{ fontFamily: mono, fontSize: 13 }}>{money(r.cashPrizes + r.otherPrizes)}</div> },
            { key: "unsold", label: "Unsold value (O)", grid: "1fr", render: (r) => <div style={{ fontFamily: mono, fontSize: 13 }}>{money(r.unsoldValue)}</div> },
            { key: "profit", label: "Profit (P)", grid: "1fr", render: (r) => <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: r.actualProfit >= 0 ? colors.success : colors.danger }}>{money(r.actualProfit)}</div> },
            { key: "retention", label: "Retention until", grid: "1.2fr", render: (r) => <div style={{ fontFamily: mono, fontSize: 13 }}>{new Date(r.retentionUntil).toLocaleDateString()}</div> },
          ]}
        />
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

      {deleting && (
        <DeleteDealModal
          deal={deleting}
          onCancel={() => { setDeleting(null); setDeleteError(""); }}
          onConfirm={async () => {
            setDeleteError("");
            try {
              await api.deleteDeal(deleting.id);
              setDeleting(null);
              onChanged();
            } catch (err) {
              setDeleteError(err.message);
            }
          }}
          error={deleteError}
        />
      )}
    </div>
  );
}

function DeleteDealModal({ deal, onCancel, onConfirm, error }) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onCancel={onCancel} width={420} title={`Delete "${deal.name}"?`}>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
        {deal.status === "active" && deal.soldToDate > 0
          ? `This permanently removes the game and the ${deal.soldToDate.toLocaleString()} ticket sale${deal.soldToDate === 1 ? "" : "s"} already logged against it. This can't be undone.`
          : "This permanently removes the game. This can't be undone."}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button style={button.ghost} onClick={onCancel} disabled={busy}>Cancel</button>
        <button style={{ ...button.primary, background: colors.danger }} onClick={confirm} disabled={busy}>
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </Modal>
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
    <Modal onCancel={onCancel} width={420} title={`Close "${deal.name}"`}>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>Enter the physical unsold ticket count to compute final profit.</div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "#5c564c", marginBottom: 14 }}>
        Unsold ticket count (N)
        <input style={inputStyle} type="number" min="0" max={deal.ticketCount} value={unsoldCount} onChange={(e) => setUnsoldCount(e.target.value)} autoFocus />
      </label>

      <div style={{ background: "#f7f4ec", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontFamily: mono, marginBottom: 16 }}>
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
    </Modal>
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
    <form onSubmit={submit} style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}`, background: "#f7f4ec", display: "flex", flexDirection: "column", gap: 10 }}>
      <LabelPhotoField image={form.labelImage} onImageChange={(img) => set("labelImage", img)} onScanned={applyScan} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <Field label="Game name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Form #"><input style={inputStyle} required value={form.formNum} onChange={(e) => set("formNum", e.target.value)} /></Field>
        <Field label="Serial #"><input style={inputStyle} required value={form.serialNum} onChange={(e) => set("serialNum", e.target.value)} /></Field>
        <Field label="Ticket count"><input style={inputStyle} type="number" min="1" required value={form.ticketCount} onChange={(e) => set("ticketCount", e.target.value)} /></Field>
        <Field label="Ticket price"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} /></Field>
        <Field label="Ideal payout"><input style={inputStyle} type="number" step="0.01" min="0.01" required value={form.idealPayout} onChange={(e) => set("idealPayout", e.target.value)} /></Field>
        <Field label="Close at %"><input style={inputStyle} type="number" min="75" max="100" step="1" required value={form.closeThresholdPct} onChange={(e) => set("closeThresholdPct", e.target.value)} /></Field>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
    <Modal onCancel={onCancel} width={460} title={`Correct "${deal.name}"`}>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 16 }}>
        {deal.status === "active" && deal.soldToDate > 0
          ? `Corrections here won't touch the ${deal.soldToDate.toLocaleString()} tickets and ${money(deal.prizesAwardedToDate)} in prizes already recorded.`
          : "Fix any details logged in error before this game goes on the machine."}
      </div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <LabelPhotoField image={form.labelImage} onImageChange={(img) => set("labelImage", img)} onScanned={applyScan} />
        <Field label="Game name"><input style={inputStyle} required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Field label="Form #"><input style={inputStyle} required value={form.formNum} onChange={(e) => set("formNum", e.target.value)} /></Field>
          <Field label="Serial #"><input style={inputStyle} required value={form.serialNum} onChange={(e) => set("serialNum", e.target.value)} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
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
          75% is the NYS minimum before this game can be closed — set higher only if the org wants a stricter bar.
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
    </Modal>
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

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: colors.textSecondary, fontFamily: "Inter, sans-serif" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
