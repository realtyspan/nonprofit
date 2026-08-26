const prisma = require("./prisma");

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

// Reuses an existing GolfPlayer by normalized email within the org, or
// creates a fresh one — the same "one identity across years" pattern
// GolfPlayer exists for. `client` is either `prisma` or a transaction
// handle, since this runs inside a transaction during registration.
async function findOrCreatePlayer(client, orgId, { name, email, phone }) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const existing = await client.golfPlayer.findFirst({ where: { orgId, email: normalizedEmail } });
    if (existing) return existing;
  }
  return client.golfPlayer.create({ data: { orgId, name: name.trim(), email: normalizedEmail, phone: (phone || "").trim() } });
}

// Shared by both admin-entered registration (server/src/routes/golf.js) and
// public self-service registration (server/src/routes/publicGolf.js) —
// capacity is enforced identically regardless of which channel a team comes
// in through. The conditional updateMany row-locks the tournament for the
// transaction's duration under Postgres's normal READ COMMITTED semantics,
// so two simultaneous registrations for the last slot can't both succeed.
async function registerTeam(orgId, tournament, { teamName, players }) {
  if (!Array.isArray(players) || players.length < 1) {
    throw Object.assign(new Error("At least one player is required"), { status: 400 });
  }
  if (players.length > tournament.maxTeamSize) {
    throw Object.assign(new Error(`This tournament allows at most ${tournament.maxTeamSize} players per team`), { status: 400 });
  }
  for (const p of players) {
    if (!p.name || !p.name.trim()) throw Object.assign(new Error("Every player needs a name"), { status: 400 });
  }

  return prisma.$transaction(async (tx) => {
    const capacityResult = await tx.golfTournament.updateMany({
      where: { id: tournament.id, OR: [{ capacity: null }, { registeredTeamCount: { lt: tournament.capacity } }] },
      data: { registeredTeamCount: { increment: 1 } },
    });
    if (capacityResult.count === 0) throw Object.assign(new Error("This tournament is full"), { status: 409 });

    const team = await tx.golfTeam.create({ data: { orgId, tournamentId: tournament.id, name: teamName?.trim() || null } });

    for (const p of players) {
      const player = await findOrCreatePlayer(tx, orgId, p);
      await tx.golfTeamPlayer.create({
        data: {
          orgId, tournamentId: tournament.id, teamId: team.id, playerId: player.id,
          isCaptain: !!p.isCaptain, amountDue: tournament.costPerPlayer,
        },
      });
    }

    return team.id;
  });
}

// Single canonical activity-log writer, shared across golf.js and
// publicGolf.js so admin-entered and public-registered actions both leave
// the same trail.
async function addGolfLog(orgId, tournamentId, { type, text, actorName = "", teamId = null, playerId = null, sponsorshipId = null }) {
  await prisma.golfLog.create({ data: { orgId, tournamentId, type, text, actorName, teamId, playerId, sponsorshipId } });
}

module.exports = { normalizeEmail, findOrCreatePlayer, registerTeam, addGolfLog };
