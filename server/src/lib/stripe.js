// Thin Stripe SDK wrapper — mirrors notifications.js's role for Brevo, one
// place every route imports the client and the plan's price IDs from. One
// flat plan, two cadences, both created once via a one-off setup script (see
// project memory) — adjusting the actual dollar amount later just means
// editing the Price in Stripe, not touching this file.
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY,
  annual: process.env.STRIPE_PRICE_ID_ANNUAL,
};

const PRICE_AMOUNTS = {
  monthly: 39,
  annual: 390,
};

module.exports = { stripe, PRICE_IDS, PRICE_AMOUNTS };
