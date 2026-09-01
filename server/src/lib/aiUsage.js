// One shared usage/cost ledger for every AI-assisted feature (the Bell Jar
// label scanner, the golf historical-import reader, and whatever's added
// next) — a single place to log a call instead of each feature inventing
// its own tracking, and a single place platform-admin's cross-org report
// and each org's own usage view both read from.
const prisma = require("./prisma");

// $ per million tokens, by model. Rates are looked up and baked into
// costUsd at write time, so a rate change later never rewrites what an
// already-logged call is shown to have cost.
const MODEL_RATES = {
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
};

function computeCostUsd(model, inputTokens, outputTokens) {
  const rate = MODEL_RATES[model];
  if (!rate) return 0; // unrecognized model — tokens still logged, cost just reads as 0 rather than throwing
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}

// Never let usage logging break the feature it's measuring — a failure here
// is swallowed (and reported to the server log) rather than surfaced to the
// caller, same spirit as this app's other best-effort side writes (activity
// logs, alert emails).
async function logAiUsage({ orgId, feature, model, inputTokens, outputTokens, success = true }) {
  try {
    await prisma.aiUsageLog.create({
      data: {
        orgId, feature, model,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        costUsd: computeCostUsd(model, inputTokens || 0, outputTokens || 0),
        success,
      },
    });
  } catch (err) {
    console.error("Failed to log AI usage:", err.message);
  }
}

module.exports = { logAiUsage, computeCostUsd, MODEL_RATES };
