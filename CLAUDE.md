# Bell Jar Manager (Elks Lodge #2022)

Compliance and operations app for Red Hook Rhinebeck Elks Lodge #2022 — built to replace manual tracking for NYS "Games of Chance" (Bell Jar) compliance, facility rentals, a shared calendar, and the annual "400 Club" raffle.

## Who this is for
The product owner is non-technical — all code in this repo is written by Claude (no outside contractors). Treat feature requests as coming from someone who knows the *business* rules (NYS Games of Chance regulations, lodge operations) but not the implementation, and explain technical tradeoffs in plain terms rather than assuming familiarity with the stack.

## Architecture
- **Monorepo**: `client/` (React + Vite) and `server/` (Express + Prisma) as separate `npm` projects — no workspace tooling, just two independent `package.json`s.
- **Database**: Postgres, hosted on Railway. **Local dev and production point at the same database** — there is no separate dev DB. Any test data created while developing/verifying a feature must be cleaned up afterward (a small Prisma script deleting rows in dependency order is the established pattern) so it doesn't pollute real lodge data.
- **Deployment**: Railway auto-deploys from `origin/main` on GitHub (`realtyspan/nonprofit`). Pushing to `main` ships to production — there's no separate staging environment or review step.
- **Domains**: `elkslodges.org` (bare + www) serves the marketing landing page; every other hostname (the app subdomain, `localhost`, Railway's own `*.up.railway.app`) serves the actual app. This split lives in `client/src/App.jsx` as a hostname check, not a routing config.
- **Multi-tenant**: every org-scoped table has an `orgId`; every route filters by `req.user.orgId`. Permissions are per-module (`bell-jar`, `rentals`, `calendar`, `raffle`, `elks-tools`) with tiers `Owner > Admin > Helper > Viewer`.

## Non-obvious gotchas
- **Prisma relations aren't cascading by default** in this schema (e.g. `DailySale`/`Schedule1Record` → `Deal`). Deleting a parent record requires an explicit `prisma.$transaction([...])` cleaning up dependents first, or it throws a foreign-key error.
- **Closed deals are immutable** — both edit and delete routes block any change once `deal.status === "closed"`, because the Schedule 1 audit trail has to stay untouched for NYS compliance. This is a deliberate compliance rule, not an oversight, if it ever looks like a missing feature.
- **Windows dev environment friction**: watch for Prisma file locks (stop the running `node` process before re-running migrations), migration drift, git long-path issues, and UTC vs. local time bugs in date handling (there was a real timezone bug here — see git log "Fix scheduling timezone bug").
- **Stale server process**: editing server-side files does *not* hot-reload — the running `node src/index.js` must be killed and restarted before re-testing, or you'll see old behavior and think a fix didn't work.
- **Never hand-transcribe large base64 blobs through generated text output** (e.g. when testing image uploads) — manual copy/paste of a large base64 string has previously corrupted it. Build test images programmatically (e.g. via a browser canvas) and pass them directly, never through your own written-out text.
- **Public/embed pages** (`PublicRental.jsx`, `PublicCalendar.jsx`) are iframe-embeddable on the lodge's own website and take theme colors via query params (`lib/embedTheme.js`) — they intentionally don't share the same static design tokens as the internal admin UI everywhere, since they need to inherit the host site's look.
- **Two different "list of modules" constants exist server-side — don't confuse them.** `server/src/lib/moduleKeys.js`'s `MODULE_KEYS` is the live, current list used for permission validation (module-grant checks, legacy-invite mapping) and must be updated every time a module is added. `server/prisma/backfill-permissions.js`'s own `MODULES` is deliberately frozen to whatever modules existed at the original permissions-model cutover, for a one-time historical backfill script — it must *not* be updated to match. Adding Elks Tools and only updating the backfill script's list (or forgetting `moduleKeys.js` entirely) is exactly the bug that shipped and had to be hotfixed — see git log "Fix module-grant validation not recognizing elks-tools".
- **Rental pricing logic is hand-duplicated in two places** and must be kept in sync manually: `server/src/lib/rentalLogic.js` (server, source of truth) and `client/src/lib/rentalPricing.js` (client-side mirror, used only for live preview in the staff confirm modal and the public inquiry form). Adding a new pricing component (like the linen service add-on) means editing both files identically.
- **`xlsx` (SheetJS), used by the Elks Tools FRS report generator, has known unfixed security advisories** (prototype pollution, ReDoS — no patched version on npm as of when it was added). Accepted as low-risk since only authenticated, permissioned lodge officers upload their own files through it, not public/untrusted input — but worth knowing before reusing that dependency anywhere more exposed.

## Environment setup
`server/.env` needs: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY` (used by `server/src/lib/labelScan.js` for the game-label photo scan feature), `BREVO_API_KEY` (transactional email), `PORT`. Not committed — see `server/.env.example` for the shape, but the real values aren't derivable from the repo and need to come from whoever already has them.

Local dev: `npm install` + `npm run dev` in both `client/` and `server/` (client on :5173, server on :4000). Prisma migrations use a non-interactive path (`prisma migrate diff` → hand-write the migration file → `prisma migrate deploy`) rather than `prisma migrate dev`, to avoid interactive prompts that don't work well in this environment.

## Deferred / intentionally out of scope
- Historical raffle data from the lodge's old system (`github.com/realtyspan/Elks2022`) has not been imported — the raffle module here is a fresh build, not a migration. Import is a separate future task if it's ever needed.
- Full adoption of the new logo's color palette (teal/coral/cream) across the whole app is intentionally deferred — only the logo/favicon and a lighter button accent have shipped so far; the rest of the UI still uses the older purple design tokens until that's explicitly scoped as its own pass.
