// Thin Stripe SDK wrapper — mirrors notifications.js's role for Brevo, one
// place every route imports the client and the plan's price IDs from. One
// flat plan, two cadences, both created once via a one-off setup script (see
// project memory) — adjusting the actual dollar amount later just means
// editing the Price in Stripe, not touching this file.
const Stripe = require("stripe");

// Lazy — constructed on first actual use, not at import time. This module is
// required unconditionally from index.js (via stripeWebhook.js) and
// platformAdmin.js, so eagerly constructing here would crash the entire
// server on boot in any environment missing STRIPE_SECRET_KEY (e.g. Railway
// before the new billing env vars are added), taking down every unrelated
// route along with it. Deferring construction means a missing key only
// fails the specific Stripe-dependent request that needs it.
let _client = null;
const stripe = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!_client) _client = new Stripe(process.env.STRIPE_SECRET_KEY);
      return _client[prop];
    },
  }
);

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY,
  annual: process.env.STRIPE_PRICE_ID_ANNUAL,
};

const PRICE_AMOUNTS = {
  monthly: 39,
  annual: 390,
};

// Golf Stripe Connect: Express accounts, direct charges. The platform takes
// no fee and must never touch a connected org's player payments even
// transiently, so this runs on the platform's own Stripe account/key (same
// client as above) purely to create/manage the connected account — actual
// charges are made directly against the connected account via the
// `{ stripeAccount: acctId }` request option, elsewhere.
async function createExpressAccount({ email, orgName }) {
  return stripe.accounts.create({
    type: "express",
    email: email || undefined,
    business_profile: { name: orgName },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  });
}

async function createOnboardingLink(accountId, { refreshUrl, returnUrl }) {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
}

module.exports = { stripe, PRICE_IDS, PRICE_AMOUNTS, createExpressAccount, createOnboardingLink };
