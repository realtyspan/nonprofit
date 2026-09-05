// Separate from stripeWebhook.js on purpose (see plan doc): isolates this
// brand-new, money-moving integration from the already-live platform-billing
// webhook, can be rotated/disabled independently in the Stripe Dashboard,
// and Connect's `account.updated` events are keyed by top-level
// `event.account`, not `event.data.object.customer` like the existing
// handler expects — they need their own Dashboard registration regardless.
// Mounted in index.js with express.raw(), same as stripeWebhook.js.
const prisma = require("../lib/prisma");
const { stripe } = require("../lib/stripe");
const { addGolfLog, markGolfCheckoutSessionPaid, revertGolfCheckoutSession } = require("../lib/golfLogic");

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
      // The authoritative backstop for golf pay-page checkouts — the
      // client's own /pay/sync and /pay/cancel calls (publicGolf.js) race
      // to handle the same outcome for instant feedback on return, but
      // this is what catches anyone who closes the tab before either of
      // those ever fires. markGolfCheckoutSessionPaid/
      // revertGolfCheckoutSession are both guarded on paymentStatus:
      // "pending", so running the same outcome twice (once from the
      // client, once from here) is always a documented no-op.
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status === "paid") {
          const result = await markGolfCheckoutSessionPaid(session.id, { paymentIntentId: session.payment_intent });
          if (result.count > 0) {
            await addGolfLog(result.orgId, result.tournamentId, {
              type: "payment_recorded",
              text: `${result.count} player(s) paid online via Stripe`,
              teamId: result.teamId,
            });
          }
        }
        break;
      }
      case "checkout.session.expired": {
        // Stripe's own ~24h timeout on a session nobody ever completed or
        // explicitly canceled — reverts it the same way /pay/cancel does,
        // so an abandoned attempt doesn't leave a team stuck showing
        // "pending" indefinitely.
        const result = await revertGolfCheckoutSession(event.data.object.id);
        if (result.count > 0) {
          await addGolfLog(result.orgId, result.tournamentId, {
            type: "payment_recorded",
            text: `${result.count} player(s)' online payment attempt expired`,
            teamId: result.teamId,
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Stripe retries on a non-2xx response — log and still ack the event
    // rather than get stuck retrying one we can't process.
    console.error(`Error handling Stripe Connect webhook ${event.type}:`, err.message);
  }

  res.json({ received: true });
}

module.exports = { stripeConnectWebhookHandler };
