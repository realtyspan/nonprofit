// Text of the Terms of Service and Privacy Policy, kept as plain data so the
// legal pages (views/Legal.jsx) stay pure layout. THESE ARE DRAFTS written from
// how the product actually works — the operator should have an attorney review
// them (especially the fee/refund terms, limitation of liability, and
// governing-law sections) before relying on them.
//
// Change the operator name or contact address in one place: here.

// Must match server/src/lib/legal.js's TERMS_VERSION — that's the version
// recorded against a user when they accept at signup.
export const TERMS_VERSION = "2026-09-19";
export const TERMS_UPDATED_LABEL = "September 19, 2026";

export const OPERATOR_NAME = "Data Derivation";
export const SERVICE_NAME = "Charity Pulse";
// Set VITE_SUPPORT_EMAIL at build time once there's a public support address;
// until then the pages point people at the contact details they already have
// (their sign-in and invoice emails) instead of showing a wrong address.
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "";

const contactLine = SUPPORT_EMAIL
  ? `You can reach us at ${SUPPORT_EMAIL}.`
  : `Contact us using the support details in your account emails or on your invoice.`;

export const TERMS = {
  title: "Terms of Service",
  intro: `These terms are the agreement between ${OPERATOR_NAME} ("we", "us") and the organization and person signing up for ${SERVICE_NAME} ("you"). By creating an organization or using ${SERVICE_NAME}, you agree to them.`,
  sections: [
    {
      heading: "1. What Charity Pulse is",
      body: [
        `${SERVICE_NAME} is web software for volunteer-run organizations such as lodges, posts, and fire departments. It helps manage Bell Jar and raffle records, facility rentals, a shared calendar, events, tournaments, and related public pages and flyers.`,
        `${SERVICE_NAME} is not affiliated with the New York State Gaming Commission or any other government agency.`,
      ],
    },
    {
      heading: "2. Your account and organization",
      body: [
        "You confirm you are authorized to create an account for your organization and to accept these terms on its behalf.",
        "Keep your password private. You are responsible for what happens under your account and for the people you add to your organization, including the access level you give each of them.",
        "Provide accurate information, and keep it current.",
      ],
    },
    {
      heading: "3. Plans, billing, and cancellation",
      body: [
        "Charity Pulse is offered on a flat plan that includes every module: $39 per month, or $390 per year, per organization. Prices are in US dollars and may change; we will give at least 30 days' notice before a price change affects you.",
        "We may offer a free trial. When a trial ends we may ask you to subscribe to keep using the service.",
        "Paid plans are billed through Stripe and renew automatically each month or year until canceled. You can cancel at any time; cancellation takes effect at the end of the period you have already paid for, and you keep access until then.",
        "Fees already paid are not refunded for partial periods. If you cancel a new annual plan within 14 days of the first payment, contact us and we will refund it.",
        "If a payment fails we may suspend access until it is resolved.",
      ],
    },
    {
      heading: "4. Your data",
      body: [
        "You own the information you and your members put into Charity Pulse. You give us permission to store, process, and display it only as needed to run the service for you.",
        "You can ask us to export or delete your organization's data, and we will do so within a reasonable time after you cancel or ask. We keep routine backups for a limited period, and may keep records we are required to keep by law.",
        "You are responsible for having the right to enter other people's information (for example ticket buyers, players, or renters) and for using it lawfully.",
      ],
    },
    {
      heading: "5. Compliance is your responsibility",
      body: [
        "Charity Pulse produces reports and forms, including Schedule 1 and GC-7Q, that are designed to match official New York State Gaming Commission forms as we understand them. It is a bookkeeping and preparation tool, not legal, tax, or accounting advice.",
        "You are responsible for reviewing everything before you file or sign it, for holding any required licenses, and for following the laws that apply to your games of chance, raffles, and fundraising. Selling raffle or Bell Jar tickets online is not offered in Charity Pulse and may require a license.",
      ],
    },
    {
      heading: "6. Online payments to your organization",
      body: [
        "Where a module lets people pay your organization online (for example tournament entry fees), payments are processed by Stripe in your organization's own Stripe account. We do not hold or transfer those funds and do not take a fee on them.",
        "Your organization is the seller: you are responsible for those payments, refunds, and disputes, and Stripe's own terms apply to your use of Stripe.",
      ],
    },
    {
      heading: "7. AI-assisted features",
      body: [
        "Some features use artificial intelligence, such as reading a photographed game label, interpreting an imported spreadsheet, or drafting an event description. What you submit to those features is sent to an AI provider to produce the result.",
        "AI output can be wrong. It is always a draft for you to review and correct before you save or publish it.",
      ],
    },
    {
      heading: "8. Acceptable use",
      body: [
        "Do not use Charity Pulse to break the law, to send spam, to interfere with the service or other customers, to try to access data that isn't yours, or to store content you have no right to store.",
        "We may suspend an account that violates these terms or puts the service or other customers at risk.",
      ],
    },
    {
      heading: "9. Availability and changes",
      body: [
        "We work to keep Charity Pulse available and accurate, but we do not promise it will be uninterrupted or error-free. We may add, change, or remove features over time.",
      ],
    },
    {
      heading: "10. Disclaimers and limits on liability",
      body: [
        `${SERVICE_NAME} is provided "as is" without warranties of any kind, to the extent the law allows.`,
        "To the extent the law allows, our total liability to you for any claim related to the service is limited to the fees you paid us in the 12 months before the claim, and we are not liable for indirect or consequential losses, including any penalty, fine, or loss arising from a filing you made.",
      ],
    },
    {
      heading: "11. Ending your use",
      body: [
        "You may stop using Charity Pulse at any time. We may end or suspend an account for a serious or repeated breach of these terms. Sections that by their nature should survive (such as data, liability, and governing law) continue after the account ends.",
      ],
    },
    {
      heading: "12. Governing law",
      body: ["These terms are governed by the laws of the State of New York, without regard to conflict-of-law rules."],
    },
    {
      heading: "13. Changes to these terms",
      body: [
        "We may update these terms. If a change is significant we will tell you in the app or by email, and the date at the top of this page will change. Using Charity Pulse after a change means you accept it.",
      ],
    },
    {
      heading: "14. Contact",
      body: [contactLine],
    },
  ],
};

export const PRIVACY = {
  title: "Privacy Policy",
  intro: `This explains what information ${SERVICE_NAME}, operated by ${OPERATOR_NAME}, collects, why, and who else handles it.`,
  sections: [
    {
      heading: "1. Information we collect",
      body: [
        "Account information: your name, email address, organization name and type, and a password (stored only as a one-way hash, never in readable form).",
        "Information your organization enters: for example members, ticket buyers, sellers, players and sponsors, renters, events, and financial records for your games and fundraisers. Your organization decides what to put in, and controls it.",
        "Payment information: subscription payments and online entry-fee payments are handled by Stripe. We never see or store full card numbers.",
        "Basic technical information needed to run and secure the service, such as server logs and the sign-in token kept in your browser.",
      ],
    },
    {
      heading: "2. How we use it",
      body: [
        "To provide and secure the service, send account and password-reset emails, bill for the subscription, and give you support.",
        "We do not sell your information, and we do not use it for advertising. Charity Pulse has no advertising or analytics trackers.",
      ],
    },
    {
      heading: "3. Who else handles it",
      body: [
        "We use a small number of service providers to run Charity Pulse: Railway (hosting and database), Stripe (payments), Brevo (sending email), and Anthropic (the AI-assisted features, only for what you choose to submit to them). Public pages that use a custom font may load it from Google Fonts.",
        "These providers may only use the information to provide their service to us. We may also disclose information if the law requires it.",
      ],
    },
    {
      heading: "4. Information about other people",
      body: [
        "When your organization records information about other people (a ticket buyer, a tournament player, a renter), your organization is responsible for that information and for having the right to collect it. We process it on your behalf to run the service. If you are one of those people and want your information changed or removed, contact the organization first.",
      ],
    },
    {
      heading: "5. Keeping and deleting information",
      body: [
        "We keep your information while your account is active. After you cancel or ask us to delete your organization's data, we delete it within a reasonable time, apart from routine backups that age out and records we must keep by law.",
      ],
    },
    {
      heading: "6. Security",
      body: [
        "We use encrypted connections, hashed passwords, and access controls that keep each organization's data separate. No system is perfectly secure, so please use a strong, unique password.",
      ],
    },
    {
      heading: "7. Your choices",
      body: [
        "You can update your profile in the app, and you can ask us to export or delete your information. Organization Owners can also ask us to delete the whole organization.",
      ],
    },
    {
      heading: "8. Children",
      body: [`${SERVICE_NAME} is built for organizations and is not directed at children under 13.`],
    },
    {
      heading: "9. Changes",
      body: ["If we change this policy in a meaningful way we will update the date above and, where appropriate, tell you in the app or by email."],
    },
    {
      heading: "10. Contact",
      body: [contactLine],
    },
  ],
};
