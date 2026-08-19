import { icons } from "./icons";

// One config per module's dedicated marketing page (client/src/views/marketing/ModulePage.jsx
// renders whichever one matches the current path) — see App.jsx's routing.
export const MARKETING_MODULES = {
  "bell-jar": {
    slug: "bell-jar",
    name: "Bell Jar",
    tagline: "NYS Bell Jar / Games of Chance compliance, without the quarterly scramble",
    icon: icons.layers,
    badge: "Built for NYS Bell Jar / Games of Chance compliance",
    heroHeadline: "Bell Jar compliance, without the quarterly scramble",
    heroSubhead: "Track ticket sales, manage your deal inventory, and generate the real NYS Schedule 1 and GC-7Q forms — automatically, every quarter. Built for the volunteer Chairperson or Member in Charge who has a day job too.",
    features: [
      { icon: icons.table, title: "Sales Worksheet", body: "Log tickets sold and cash collected each time the machine is opened to retrieve funds and refill tickets — profit/loss computes live, no spreadsheet required." },
      { icon: icons.layers, title: "Deal Lifecycle Tracking", body: "Log a game when it's received, activate it when it goes on the machine, and get flagged the moment it crosses your 75% close threshold." },
      { icon: icons.fileCheck, title: "Real NYS Forms, Auto-Filled", body: "Schedule 1 and GC-7Q — the actual state forms, stamped with your quarter's numbers and ready to print and mail." },
      { icon: icons.bank, title: "Bank Ledger & Receipts", body: "Categorized disbursements (ticket purchases, license fees, indirect costs) feed straight into your quarterly report math." },
      { icon: icons.users, title: "Team & Roles", body: "Assign an Owner to manage access, a Chairman for each committee, and helpers to assist — everyone sees exactly what their role needs, nothing more." },
      { icon: icons.userCircle, title: "Built for Audits", body: "Retention dates, sign-off trails, and a correction workflow that never lets a filed report silently drift." },
    ],
    steps: [
      { n: "1", title: "Log sales when you service the machine", body: "Whoever checks the machine — based on usage, not a fixed schedule — logs tickets sold and prizes paid when they retrieve funds and refill tickets." },
      { n: "2", title: "Track deals to close", body: "Watch the 75% threshold, then close a deal with one form." },
      { n: "3", title: "File with confidence", body: "Generate the real Schedule 1 and GC-7Q PDFs, signed and ready to mail." },
    ],
    pricing: { amount: 39, period: "month", altPeriod: "or $390/year — 2 months free", bullets: ["Unlimited users, all roles", "Real Schedule 1 & GC-7Q PDF generation", "Sales worksheet, deal tracking, ledger", "30-day free trial, no card required"] },
  },

  rentals: {
    slug: "rentals",
    name: "Rental Space",
    tagline: "Facility rentals, from inquiry to signed contract",
    icon: icons.key,
    badge: "For lodges that rent out their hall, pavilion, or event space",
    heroHeadline: "Facility rentals, from inquiry to signed contract",
    heroSubhead: "A public booking page for your website, real-time pricing quotes, and a single place to confirm, decline, and track every rental — deposits and contract signatures included.",
    features: [
      { icon: icons.inbox, title: "Public Booking Requests", body: "A link for your website where renters check availability, pick a space, and submit a request — you review and confirm, nothing books itself." },
      { icon: icons.sliders, title: "Spaces & Rates", body: "Member and non-member pricing, per-hour overage rates, bartender add-ons, and itemized equipment fees — tables, chairs, kitchen use, chafing dishes." },
      { icon: icons.ban, title: "Internal Blocks", body: "Hold a space for the Lodge's own use — a meeting, a members-only function — so it never gets double-booked against a public request." },
      { icon: icons.fileCheck, title: "Deposits & Signatures", body: "Track deposits collected and capture a renter's contract signature electronically, right on the booking record." },
      { icon: icons.link, title: "Embeddable Calendar", body: "Show renters what's already taken without exposing anyone's private booking details — matches your website's own look." },
      { icon: icons.checkCircle, title: "Confirm or Decline, Fast", body: "Every inquiry lands in one inbox-style list — accept it, decline it, or reach out for more details, all from the same screen." },
    ],
    steps: [
      { n: "1", title: "Renter submits a request", body: "From your website's booking page — space, date, guest count, equipment needs, all in one form." },
      { n: "2", title: "You confirm availability", body: "Review the request against what's already booked or blocked, then confirm or decline." },
      { n: "3", title: "Track the deposit and signature", body: "Record the deposit collected and capture a signed agreement, all on the same booking." },
    ],
    pricing: { amount: 19, period: "month", placeholder: true, bullets: ["Unlimited spaces and bookings", "Public booking page for your website", "Deposit and contract-signature tracking", "30-day free trial, no card required"] },
  },

  raffle: {
    slug: "raffle",
    name: "Raffle",
    tagline: "Run your annual raffle without losing track of a single ticket",
    icon: icons.ticket,
    badge: "For NYS-licensed raffles — also a Games of Chance activity",
    heroHeadline: "Run your annual raffle without losing track of a single ticket",
    heroSubhead: "Sell tickets, run drawings, check people in on the night of, and know — in real time — whether you're staying within NYS's net-proceeds thresholds.",
    features: [
      { icon: icons.grid, title: "Ticket Grid", body: "Every ticket, at a glance — reserved, sold, or funds received, recorded with buyer info and payment method as sales happen." },
      { icon: icons.dice, title: "Drawings & Winners", body: "Schedule drawings, draw at random or enter a ticket manually, and keep a permanent Winners history for every raffle you run." },
      { icon: icons.checkCircle, title: "Door Check-In", body: "Search by name, phone, or ticket number to verify a winner on drawing night — full buyer visibility regardless of who sold the ticket." },
      { icon: icons.phoneCall, title: "Renewal Calls", body: "Track outreach to last year's buyers so no one falls through the cracks when it's time to sell again." },
      { icon: icons.bank, title: "NYS Compliance Dashboard", body: "A live financial statement showing year-to-date net proceeds across every raffle you run, flagging when you cross NYS's $5,000 and $30,000 thresholds." },
      { icon: icons.users, title: "Sellers & Assignment", body: "Assign ticket ranges to sellers and see exactly who sold what — full accountability without a spreadsheet." },
    ],
    steps: [
      { n: "1", title: "Set up the raffle", body: "Ticket range, price, and drawing dates — start selling in minutes." },
      { n: "2", title: "Sell and collect", body: "Record sales, reservations, and funds received as they come in, from any seller." },
      { n: "3", title: "Draw, check in, and stay compliant", body: "Run drawings, verify winners at the door, and watch your compliance status the whole way through." },
    ],
    pricing: { amount: 25, period: "month", placeholder: true, bullets: ["Unlimited tickets and drawings", "Live NYS compliance dashboard", "Door check-in and renewal tracking", "30-day free trial, no card required"] },
  },

  calendar: {
    slug: "calendar",
    name: "Calendar",
    tagline: "One calendar for every event, booking, and hold",
    icon: icons.calendar,
    badge: "Included free with any paid module",
    heroHeadline: "One calendar for every event, booking, and hold",
    heroSubhead: "Lodge meetings, confirmed rentals, and internal holds — all in one place automatically, with a public embed for your website so members and renters always see what's actually available.",
    features: [
      { icon: icons.calendar, title: "Month & Week Views", body: "See everything at a glance, or drill into a single week when you need the hour-by-hour detail." },
      { icon: icons.repeat, title: "Automatic Sync", body: "Confirmed rental bookings and internal blocks show up automatically — no double entry, no chance of drift." },
      { icon: icons.link, title: "Public Embed", body: "A link for your website, themeable to match your site's own colors and fonts, showing only what's meant to be public." },
      { icon: icons.checkCircle, title: "Recurring Events", body: "Weekly meetings, monthly committee nights — set the pattern once and it keeps itself up to date." },
    ],
    steps: [
      { n: "1", title: "Add your lodge's events", body: "One-off or recurring — trustee meetings, dinners, anything on the calendar." },
      { n: "2", title: "Everything else joins automatically", body: "Confirmed rentals and internal holds from other modules appear without any manual entry." },
      { n: "3", title: "Share the public view", body: "Embed it on your website so everyone sees the same up-to-date picture." },
    ],
    pricing: { free: true, blurb: "Calendar comes included the moment you're on any paid module — Bell Jar, Rental Space, or Raffle. Nothing extra to set up." },
  },
};

export const MARKETING_MODULE_ORDER = ["bell-jar", "rentals", "raffle", "calendar"];
