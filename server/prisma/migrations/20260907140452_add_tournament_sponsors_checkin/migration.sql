-- AlterTable
ALTER TABLE "TournamentTeam" ADD COLUMN     "sponsorshipId" TEXT;

-- CreateTable
CREATE TABLE "TournamentSponsorContact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentSponsorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentSponsorship" (
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

    CONSTRAINT "TournamentSponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentCheckIn" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "checkedInByUserId" TEXT,
    "checkedInByName" TEXT NOT NULL DEFAULT '',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentSponsorContact_orgId_idx" ON "TournamentSponsorContact"("orgId");

-- CreateIndex
CREATE INDEX "TournamentSponsorContact_orgId_email_idx" ON "TournamentSponsorContact"("orgId", "email");

-- CreateIndex
CREATE INDEX "TournamentSponsorship_orgId_idx" ON "TournamentSponsorship"("orgId");

-- CreateIndex
CREATE INDEX "TournamentSponsorship_tournamentId_idx" ON "TournamentSponsorship"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentSponsorship_sponsorId_idx" ON "TournamentSponsorship"("sponsorId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentCheckIn_teamPlayerId_key" ON "TournamentCheckIn"("teamPlayerId");

-- CreateIndex
CREATE INDEX "TournamentCheckIn_tournamentId_idx" ON "TournamentCheckIn"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentTeam_sponsorshipId_idx" ON "TournamentTeam"("sponsorshipId");

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "TournamentSponsorship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentSponsorContact" ADD CONSTRAINT "TournamentSponsorContact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentSponsorship" ADD CONSTRAINT "TournamentSponsorship_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentSponsorship" ADD CONSTRAINT "TournamentSponsorship_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentSponsorship" ADD CONSTRAINT "TournamentSponsorship_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "TournamentSponsorContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCheckIn" ADD CONSTRAINT "TournamentCheckIn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCheckIn" ADD CONSTRAINT "TournamentCheckIn_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentCheckIn" ADD CONSTRAINT "TournamentCheckIn_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TournamentTeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
