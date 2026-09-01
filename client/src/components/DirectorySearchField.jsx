import React, { useEffect, useRef, useState } from "react";
import { colors, input as inputStyle } from "../lib/tokens";

// "Look to the list first" search box — used wherever an admin flow adds a
// player or sponsor to a tournament, so an existing person/company already
// on file (from a prior tournament or a historical import) gets reused
// instead of silently duplicated. Purely an autofill assist on top of the
// caller's own Name/Email/Phone fields: picking a result just fills them
// in via onSelect, and typing a brand-new person directly still works
// exactly as before — nothing here blocks or requires a match.
export default function DirectorySearchField({ placeholder, searchFn, renderResult, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setBusy(true);
    const handle = setTimeout(() => {
      searchFn(q)
        .then((rows) => { setResults(rows); setOpen(true); })
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, searchFn]);

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(row) {
    onSelect(row);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        style={inputStyle}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4,
            background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.12)", maxHeight: 220, overflowY: "auto",
          }}
        >
          {busy && <div style={{ padding: 10, fontSize: 12.5, color: colors.textSecondary }}>Searching…</div>}
          {!busy && results.length === 0 && (
            <div style={{ padding: 10, fontSize: 12.5, color: colors.textSecondary }}>No matches — keep typing the fields below to add someone new.</div>
          )}
          {!busy && results.map((r) => (
            <div
              key={r.id}
              onClick={() => select(r)}
              style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderTop: `1px solid ${colors.borderLight}` }}
            >
              {renderResult(r)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
