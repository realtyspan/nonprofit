// Keeps OrgBilling in sync with what actually happened in Stripe. Mounted in
// index.js with express.raw() instead of the app-wide express.json() —
// Stripe's signature check needs the untouched raw body, not parsed JSON.
const prisma = require("../lib/prisma");
const { stripe, PRICE_IDS, PRICE_AMOUNTS } = require("../lib/stripe");

function cadenceForPrice(priceId) {
  if (priceId === PRICE_IDS.monthly) return "monthly";
  if (priceId === PRICE_IDS.annual) return "annual";
  return null;
}

async function syncFromSubscription(orgId, subscription) {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const cadence = cadenceForPrice(priceId);
  const statusMap = { active: "active", trialing: "active", past_due: "past_due", unpaid: "past_due", canceled: "canceled", incomplete_expired: "canceled" };
  // current_period_end lives on the subscription item, not the subscription
  // itself, as of this account's API version (subscriptions can have
  // multiple items with independent billing periods) — confirmed by
  // inspecting a real subscription object directly, not assumed.
  const renewalDate = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  await prisma.orgBilling.upsert({
    where: { orgId },
    update: {
      status: statusMap[subscription.status] || "past_due",
      planName: "Standard",
      billingCycle: cadence,
      billingAmount: cadence ? PRICE_AMOUNTS[cadence] : undefined,
      renewalDate,
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
    },
    create: {
      orgId,
      status: statusMap[subscription.status] || "active",
      planName: "Standard",
      billingCycle: cadence,
      billingAmount: cadence ? PRICE_AMOUNTS[cadence] : null,
      renewalDate,
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
    },
  });
}

async function findOrgByStripeCustomerId(customerId) {
  const billing = await prisma.orgBilling.findFirst({ where: { stripeCustomerId: customerId } });
  return billing?.orgId || null;
}

async function stripeWebhookHandler(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId = session.client_reference_id;
        if (orgId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await syncFromSubscription(orgId, subscription);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const orgId = await findOrgByStripeCustomerId(subscription.customer);
        if (orgId) await syncFromSubscription(orgId, subscription);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const orgId = await findOrgByStripeCustomerId(invoice.customer);
        if (orgId && invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await syncFromSubscription(orgId, subscription);
          await prisma.orgBilling.update({ where: { orgId }, data: { lastPaymentDate: new Date() } });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const orgId = await findOrgByStripeCustomerId(invoice.customer);
        if (orgId) await prisma.orgBilling.update({ where: { orgId }, data: { status: "past_due" } });
        break;
      }
      default:
        break; // not every event type needs handling
    }
  } catch (err) {
    // Stripe retries on a non-2xx response — log and still ack the event
    // rather than get stuck retrying one we can't process.
    console.error(`Error handling Stripe webhook ${event.type}:`, err.message);
  }

  res.json({ received: true });
}

module.exports = { stripeWebhookHandler };
