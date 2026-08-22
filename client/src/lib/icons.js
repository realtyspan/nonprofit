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
  key: wrap(`<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l3 3"/><path d="M13 10l3 3"/>`),
  calendar: wrap(`<rect x="3" y="5" width="18" height="16" rx="1.5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>`),
  inbox: wrap(`<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 12l1.5-7h11L19 12"/><path d="M3 12v6a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-6"/>`),
  sliders: wrap(`<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/>`),
  ban: wrap(`<circle cx="12" cy="12" r="9"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/>`),
  link: wrap(`<path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 0 1 5.6 5.6l-1.6 1.6"/><path d="M13 18l-1 1a4 4 0 0 1-5.6-5.6l1.6-1.6"/>`),
  apps: wrap(`<circle cx="6" cy="6" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="6" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="18" cy="12" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="12" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>`),
  chevronLeft: wrap(`<path d="M15 5l-7 7 7 7"/>`),
  chevronRight: wrap(`<path d="M9 5l7 7-7 7"/>`),
  repeat: wrap(`<path d="M4 12a8 8 0 0 1 13.5-5.7L20 8.5"/><path d="M20 4.5v4h-4"/><path d="M20 12a8 8 0 0 1-13.5 5.7L4 15.5"/><path d="M4 19.5v-4h4"/>`),
  ticket: wrap(`<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/><line x1="12" y1="6" x2="12" y2="18" stroke-dasharray="2 2"/>`),
  phoneCall: wrap(`<path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2C9.5 21 3 14.5 3 6a2 2 0 0 1 1-2z"/>`),
  dice: wrap(`<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none"/>`),
  checkCircle: wrap(`<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>`),
  menu: wrap(`<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>`),
  close: wrap(`<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`),
  dots: wrap(`<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>`),
};
