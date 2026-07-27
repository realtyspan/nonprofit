import { icons } from "./icons";

// Each module contributes its own left-sidebar nav; the top bar switches between
// modules. Views not tied to any module (Profile) are handled separately in App.jsx.
export const MODULES = [
  {
    key: "bell-jar",
    label: "Bell Jar",
    icon: icons.layers,
    navItems: [
      { key: "dashboard", label: "Overview", icon: icons.grid, title: "Overview", subtitle: "At-a-glance compliance status" },
      { key: "worksheet", label: "Sales Worksheet", icon: icons.table, title: "Sales Worksheet", subtitle: "Log tickets sold and cash collected each time the machine is opened to retrieve funds and refill tickets" },
      { key: "deals", label: "Deals & Schedule 1", icon: icons.layers, title: "Deals & Schedule 1", subtitle: "Open deals, prize threshold, and close-deal history" },
      { key: "ledger", label: "Bank Ledger & Receipts", icon: icons.bank, title: "Bank Ledger & Receipts", subtitle: "Special Bell Jar Checking Account register" },
      { key: "reports", label: "GC-7Q Reports", icon: icons.fileCheck, title: "GC-7Q Reports", subtitle: "Quarterly aggregator, PDF overlay, and sign-off" },
      { key: "team", label: "Team", icon: icons.users, title: "Team", subtitle: "Everyone with access to this organization" },
    ],
  },
  {
    key: "rentals",
    label: "Rental Space",
    icon: icons.key,
    navItems: [
      { key: "bookings", label: "Bookings", icon: icons.inbox, title: "Bookings", subtitle: "Review inquiries and manage confirmed rentals" },
      { key: "spaces", label: "Spaces & Rates", icon: icons.sliders, title: "Spaces & Rates", subtitle: "Manage rentable spaces, pricing, and your public booking link" },
      { key: "blocks", label: "Internal Blocks", icon: icons.ban, title: "Internal Blocks", subtitle: "Hold a space for the Lodge's own use" },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: icons.calendar,
    navItems: [
      { key: "month", label: "Calendar", icon: icons.calendar, title: "Calendar", subtitle: "Lodge events plus everything published from other modules" },
    ],
  },
];
