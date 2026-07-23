// Inline hand-drawn SVG icon set per the design handoff (stroke currentColor, 1.8 weight, 24x24).
const wrap = (inner) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const icons = {
  grid: wrap(`<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`),
  table: wrap(`<rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/>`),
  layers: wrap(`<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>`),
  bank: wrap(`<line x1="3" y1="21" x2="21" y2="21"/><path d="M4 21v-8"/><path d="M9 21v-8"/><path d="M15 21v-8"/><path d="M20 21v-8"/><path d="M2 10l10-6 10 6"/>`),
  fileCheck: wrap(`<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14l2 2 4-4"/>`),
  users: wrap(`<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2"/><circle cx="17.2" cy="8.6" r="2.4"/><path d="M15.8 13.9c2.9.4 5.2 2.8 5.2 6.1"/>`),
  userCircle: wrap(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6 19c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5"/>`),
};
