-- CreateTable
CREATE TABLE "GolfTournament" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "format" TEXT,
    "maxTeamSize" INTEGER NOT NULL DEFAULT 4,
    "venueName" TEXT,
    "venueAddress" TEXT,
    "costPerPlayer" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER,
    "registeredTeamCount" INTEGER NOT NULL DEFAULT 0,
    "includedDescription" TEXT,
    "scheduleText" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "closedAt" TIMESTAMP(3),
    "allowCheckPayment" BOOLEAN NOT NULL DEFAULT false,
    "checkPayableInstructions" TEXT,
    "allowInPersonPayment" BOOLEAN NOT NULL DEFAULT false,
    "inPersonPaymentInstructions" TEXT,
    "previousTournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfPlayer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfTeam" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "sponsorshipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfTeamPlayer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "amountDue" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION,
    "checkNumber" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfTeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfCheckIn" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "checkedInByUserId" TEXT,
    "checkedInByName" TEXT NOT NULL DEFAULT '',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfSponsorContact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfSponsorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfSponsorship" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "tierName" TEXT,
    "amount" DOUBLE PRECISION,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "benefitsText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfSponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "actorName" TEXT NOT NULL DEFAULT '',
    "teamId" TEXT,
    "playerId" TEXT,
    "sponsorshipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfEmailSuppression" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfEmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgStripeConnect" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "stripeAccountId" TEXT,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started',
    "country" TEXT,
    "defaultCurrency" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgStripeConnect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GolfTournament_orgId_idx" ON "GolfTournament"("orgId");

-- CreateIndex
CREATE INDEX "GolfTournament_orgId_status_idx" ON "GolfTournament"("orgId", "status");

-- CreateIndex
CREATE INDEX "GolfTournament_previousTournamentId_idx" ON "GolfTournament"("previousTournamentId");

-- CreateIndex
CREATE INDEX "GolfPlayer_orgId_idx" ON "GolfPlayer"("orgId");

-- CreateIndex
CREATE INDEX "GolfPlayer_orgId_email_idx" ON "GolfPlayer"("orgId", "email");

-- CreateIndex
CREATE INDEX "GolfTeam_orgId_idx" ON "GolfTeam"("orgId");

-- CreateIndex
CREATE INDEX "GolfTeam_tournamentId_idx" ON "GolfTeam"("tournamentId");

-- CreateIndex
CREATE INDEX "GolfTeam_sponsorshipId_idx" ON "GolfTeam"("sponsorshipId");

-- CreateIndex
CREATE INDEX "GolfTeamPlayer_orgId_idx" ON "GolfTeamPlayer"("orgId");

-- CreateIndex
CREATE INDEX "GolfTeamPlayer_tournamentId_idx" ON "GolfTeamPlayer"("tournamentId");

-- CreateIndex
CREATE INDEX "GolfTeamPlayer_teamId_idx" ON "GolfTeamPlayer"("teamId");

-- CreateIndex
CREATE INDEX "GolfTeamPlayer_playerId_idx" ON "GolfTeamPlayer"("playerId");

-- CreateIndex
CREATE INDEX "GolfTeamPlayer_stripeCheckoutSessionId_idx" ON "GolfTeamPlayer"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "GolfTeamPlayer_teamId_playerId_key" ON "GolfTeamPlayer"("teamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GolfCheckIn_teamPlayerId_key" ON "GolfCheckIn"("teamPlayerId");

-- CreateIndex
CREATE INDEX "GolfCheckIn_tournamentId_idx" ON "GolfCheckIn"("tournamentId");

-- CreateIndex
CREATE INDEX "GolfSponsorContact_orgId_idx" ON "GolfSponsorContact"("orgId");

-- CreateIndex
CREATE INDEX "GolfSponsorContact_orgId_email_idx" ON "GolfSponsorContact"("orgId", "email");

-- CreateIndex
CREATE INDEX "GolfSponsorship_orgId_idx" ON "GolfSponsorship"("orgId");

-- CreateIndex
CREATE INDEX "GolfSponsorship_tournamentId_idx" ON "GolfSponsorship"("tournamentId");

-- CreateIndex
CREATE INDEX "GolfSponsorship_sponsorId_idx" ON "GolfSponsorship"("sponsorId");

-- CreateIndex
CREATE INDEX "GolfLog_orgId_createdAt_idx" ON "GolfLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "GolfLog_tournamentId_createdAt_idx" ON "GolfLog"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "GolfEmailSuppression_orgId_idx" ON "GolfEmailSuppression"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "GolfEmailSuppression_orgId_email_key" ON "GolfEmailSuppression"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgStripeConnect_orgId_key" ON "OrgStripeConnect"("orgId");

-- AddForeignKey
ALTER TABLE "GolfTournament" ADD CONSTRAINT "GolfTournament_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTournament" ADD CONSTRAINT "GolfTournament_previousTournamentId_fkey" FOREIGN KEY ("previousTournamentId") REFERENCES "GolfTournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfPlayer" ADD CONSTRAINT "GolfPlayer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeam" ADD CONSTRAINT "GolfTeam_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeam" ADD CONSTRAINT "GolfTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GolfTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeam" ADD CONSTRAINT "GolfTeam_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "GolfSponsorship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeamPlayer" ADD CONSTRAINT "GolfTeamPlayer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeamPlayer" ADD CONSTRAINT "GolfTeamPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GolfTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeamPlayer" ADD CONSTRAINT "GolfTeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "GolfTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeamPlayer" ADD CONSTRAINT "GolfTeamPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GolfPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfCheckIn" ADD CONSTRAINT "GolfCheckIn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfCheckIn" ADD CONSTRAINT "GolfCheckIn_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GolfTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfCheckIn" ADD CONSTRAINT "GolfCheckIn_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "GolfTeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfSponsorContact" ADD CONSTRAINT "GolfSponsorContact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfSponsorship" ADD CONSTRAINT "GolfSponsorship_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfSponsorship" ADD CONSTRAINT "GolfSponsorship_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GolfTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfSponsorship" ADD CONSTRAINT "GolfSponsorship_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "GolfSponsorContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfLog" ADD CONSTRAINT "GolfLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfLog" ADD CONSTRAINT "GolfLog_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "GolfTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfEmailSuppression" ADD CONSTRAINT "GolfEmailSuppression_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgStripeConnect" ADD CONSTRAINT "OrgStripeConnect_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
