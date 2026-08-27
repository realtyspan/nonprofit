// Separate from stripeWebhook.js on purpose (see plan doc): isolates this
// brand-new, money-moving integration from the already-live platform-billing
// webhook, can be rotated/disabled independently in the Stripe Dashboard,
// and Connect's `account.updated` events are keyed by top-level
// `event.account`, not `event.data.object.customer` like the existing
// handler expects — they need their own Dashboard registration regardless.
// Mounted in index.js with express.raw(), same as stripeWebhook.js.
const prisma = require("../lib/prisma");
const { stripe } = require("../lib/stripe");

function onboardingStatusFor(account) {
  if (account.charges_enabled) return "complete";
  if (account.details_submitted) return "restricted";
  return "onboarding";
}

async function syncAccount(account) {
  await prisma.orgStripeConnect.updateMany({
    where: { stripeAccountId: account.id },
    data: {
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
      onboardingStatus: onboardingStatusFor(account),
      country: account.country || null,
      defaultCurrency: account.default_currency || null,
    },
  });
}

async function stripeConnectWebhookHandler(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe Connect webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "account.updated": {
        await syncAccount(event.data.object);
        break;
      }
      case "account.application.deauthorized": {
        // Delivered with event.account set, not on data.object — the org
        // disconnected Stripe from their own dashboard, so "pay online"
        // needs to disappear immediately rather than wait for an admin to
        // notice and disconnect it from this app's side too.
        await prisma.orgStripeConnect.updateMany({
          where: { stripeAccountId: event.account },
          data: { chargesEnabled: false, disconnectedAt: new Date() },
        });
        break;
      }
      default:
        break; // checkout.session.* events for golf payments land once step 9 creates them
    }
  } catch (err) {
    // Stripe retries on a non-2xx response — log and still ack the event
    // rather than get stuck retrying one we can't process.
    console.error(`Error handling Stripe Connect webhook ${event.type}:`, err.message);
  }

  res.json({ received: true });
}

module.exports = { stripeConnectWebhookHandler };
