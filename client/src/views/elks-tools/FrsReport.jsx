import React, { useEffect, useState } from "react";
import { colors, card, button, money } from "../../lib/tokens";
import { api, downloadTextFile } from "../../lib/api";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the selected file"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

const RUN_COLUMNS = "1.2fr 1fr 1fr 1fr auto auto auto";

export default function FrsReport() {
  const [fileName, setFileName] = useState("");
  const [fileData, setFileData] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [runs, setRuns] = useState([]);

  function refreshRuns() {
    api.listFrsReportRuns().then(setRuns).catch(() => {});
  }
  useEffect(refreshRuns, []);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setResult(null);
    if (!/\.xlsx$/i.test(file.name)) {
      setError("Please choose an .xlsx file — the Transaction Detail by Account export from QuickBooks");
      return;
    }
    setFileName(file.name);
    setFileData(await readFileAsDataUrl(file));
  }

  async function deleteRun(run) {
    if (!window.confirm(`Delete the saved ${run.monthLabel} report? This removes both the source file and the CSV — you'd need to re-upload and regenerate to get them back.`)) return;
    try {
      await api.deleteFrsReportRun(run.id);
      refreshRuns();
    } catch (err) {
      setError(err.message);
    }
  }

  async function generate() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await api.generateFrsReport(fileData, fileName);
      setResult(res);
      refreshRuns();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>FRS Monthly Actuals Report</div>
        <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
          Upload the month's "Transaction Detail by Account" export from QuickBooks Online and this generates the 4-column CSV the Grand Lodge requires. Both files are saved below, named by month — regenerating a month replaces its previous save.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ cursor: "pointer" }}>
            <input type="file" accept=".xlsx" onChange={handleFile} style={{ display: "none" }} />
            <span style={{ ...button.ghost, display: "inline-block" }}>{fileName ? "Replace file" : "Choose .xlsx file"}</span>
          </label>
          {fileName && <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{fileName}</span>}
        </div>

        {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

        <div>
          <button style={fileData && !busy ? button.primary : button.disabled} disabled={!fileData || busy} onClick={generate}>
            {busy ? "Generating…" : "Generate report"}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.success }}>Report ready — balances ✓</div>
          <div style={{ fontSize: 13, color: colors.textPrimary }}>
            {result.transactionCount} transaction{result.transactionCount === 1 ? "" : "s"} · Total debits {money(result.totalDebits)} · Total credits {money(result.totalCredits)}
          </div>
          <div>
            <button style={button.primary} onClick={() => downloadTextFile(result.csv, result.filename)}>
              Download {result.filename}
            </button>
          </div>
          <div style={{ fontSize: 12, color: colors.textSecondary, borderTop: `1px solid ${colors.borderLight}`, paddingTop: 10 }}>
            Email this file to <strong>Adaptive@elks.cloud</strong> with <strong>"Actual"</strong> in the subject line — due the <strong>3rd Friday</strong> of the following month.
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${colors.borderLight}`, fontSize: 15, fontWeight: 700 }}>Saved reports</div>
        <div style={{ display: "grid", gridTemplateColumns: RUN_COLUMNS, padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary, borderBottom: `1px solid ${colors.borderLight}` }}>
          <div>Month</div>
          <div>Transactions</div>
          <div>Debits / Credits</div>
          <div>Generated</div>
          <div>Source</div>
          <div>CSV</div>
          <div></div>
        </div>
        {runs.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: RUN_COLUMNS, padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13, alignItems: "center" }}>
            <div style={{ fontWeight: 600 }}>{r.monthLabel}</div>
            <div>{r.transactionCount}</div>
            <div>{money(r.totalDebits)} / {money(r.totalCredits)}</div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>
              {r.generatedByName} · {new Date(r.generatedAt).toLocaleDateString()}
            </div>
            <div>
              <button style={{ ...button.ghost, padding: "6px 10px", fontSize: 12.5 }} onClick={() => api.downloadFrsReportSource(r.id, r.sourceFileName)}>
                📄 Source
              </button>
            </div>
            <div>
              <button style={{ ...button.ghost, padding: "6px 10px", fontSize: 12.5 }} onClick={() => api.downloadFrsReportCsv(r.id, r.csvFileName)}>
                ⬇ CSV
              </button>
            </div>
            <div>
              <button style={{ ...button.ghost, padding: "6px 10px", fontSize: 12.5, color: colors.danger }} onClick={() => deleteRun(r)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {runs.length === 0 && <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>No reports saved yet.</div>}
      </div>
    </div>
  );
}
