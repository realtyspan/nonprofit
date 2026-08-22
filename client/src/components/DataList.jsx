import React from "react";
import { colors } from "../lib/tokens";
import { useIsMobile } from "../lib/viewport";

// The shared responsive list/table component — replaces the CSS Grid
// "gridTemplateColumns: '1.3fr 1fr 1fr 0.9fr 0.9fr 1.6fr'" pattern that used
// to be copy-pasted per view with a fixed column count and no mobile
// fallback. Desktop keeps that exact grid-row look; below the breakpoint
// each record renders as a stacked label/value card instead.
//
// columns: [{
//   key: string (unique),
//   label: string — desktop header text, and the mobile card's label prefix,
//   grid: string — this column's desktop gridTemplateColumns fraction (e.g. "1.4fr"),
//   render: (row) => node,
//   primary?: boolean — shown as the card's bold title on mobile, no label prefix,
//   fullWidthOnMobile?: boolean — spans the card's full width instead of a label:value row (for action buttons),
//   footerRow?: boolean — pulled out of the grid entirely (desktop AND mobile) and rendered as its
//     own full-width strip under the row's other columns. Use this instead of fullWidthOnMobile when
//     a column holds several action buttons — a narrow grid track (e.g. a tablet at 768–1024px, still
//     "desktop" per useIsMobile's breakpoint) isn't wide enough for them and they wrap and stack up
//     against the right edge instead of reading as a clean action bar.
// }]
// rowStyle?: (row) => style object merged onto that row's container (e.g. to
//   highlight the currently-selected record) — applied on both desktop and mobile.
export default function DataList({ columns, rows, keyField = "id", onRowClick, rowStyle, emptyMessage = "Nothing here yet." }) {
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return <div style={{ padding: 18, fontSize: 13, color: colors.textSecondary }}>{emptyMessage}</div>;
  }

  const footerCol = columns.find((c) => c.footerRow);

  if (!isMobile) {
    const gridCols = columns.filter((c) => !c.footerRow);
    const gridTemplateColumns = gridCols.map((c) => c.grid || "1fr").join(" ");
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns, padding: "10px 18px", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", color: colors.textSecondary }}>
          {gridCols.map((c) => <div key={c.key}>{c.label}</div>)}
        </div>
        {rows.map((row) => (
          <div
            key={row[keyField]}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              padding: "12px 18px", borderTop: `1px solid ${colors.borderLight}`, fontSize: 13, cursor: onRowClick ? "pointer" : "default",
              ...rowStyle?.(row),
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns, alignItems: "center" }}>
              {gridCols.map((c) => <div key={c.key}>{c.render(row)}</div>)}
            </div>
            {footerCol && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${colors.borderLight}` }}>
                {footerCol.render(row)}
              </div>
            )}
          </div>
        ))}
      </>
    );
  }

  const primaryCol = columns.find((c) => c.primary);
  const bodyCols = columns.filter((c) => !c.primary && !c.footerRow);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
      {rows.map((row) => (
        <div
          key={row[keyField]}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          style={{
            border: `1px solid ${colors.borderLight}`, borderRadius: 10, padding: 14,
            display: "flex", flexDirection: "column", gap: 8, cursor: onRowClick ? "pointer" : "default",
            ...rowStyle?.(row),
          }}
        >
          {primaryCol && <div style={{ fontSize: 14.5, fontWeight: 700 }}>{primaryCol.render(row)}</div>}
          {bodyCols.map((c) =>
            c.fullWidthOnMobile ? (
              <div key={c.key}>{c.render(row)}</div>
            ) : (
              <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                <span style={{ color: colors.textSecondary }}>{c.label}</span>
                <span style={{ textAlign: "right" }}>{c.render(row)}</span>
              </div>
            )
          )}
          {footerCol && <div>{footerCol.render(row)}</div>}
        </div>
      ))}
    </div>
  );
}
