-- CreateTable
CREATE TABLE "TournamentType" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "format" TEXT,
    "maxTeamSize" INTEGER NOT NULL DEFAULT 4,
    "venueName" TEXT,
    "venueAddress" TEXT,
    "flyerImage" TEXT,
    "flyerImagePosition" TEXT NOT NULL DEFAULT 'center',
    "costPerPlayer" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER,
    "registeredTeamCount" INTEGER NOT NULL DEFAULT 0,
    "includedItems" JSONB,
    "scheduleItems" JSONB,
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

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlayer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeamPlayer" (
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

    CONSTRAINT "TournamentTeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "actorName" TEXT NOT NULL DEFAULT '',
    "teamId" TEXT,
    "playerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentType_orgId_idx" ON "TournamentType"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentType_orgId_name_key" ON "TournamentType"("orgId", "name");

-- CreateIndex
CREATE INDEX "Tournament_orgId_idx" ON "Tournament"("orgId");

-- CreateIndex
CREATE INDEX "Tournament_orgId_status_idx" ON "Tournament"("orgId", "status");

-- CreateIndex
CREATE INDEX "Tournament_typeId_idx" ON "Tournament"("typeId");

-- CreateIndex
CREATE INDEX "Tournament_previousTournamentId_idx" ON "Tournament"("previousTournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_orgId_slug_key" ON "Tournament"("orgId", "slug");

-- CreateIndex
CREATE INDEX "TournamentPlayer_orgId_idx" ON "TournamentPlayer"("orgId");

-- CreateIndex
CREATE INDEX "TournamentPlayer_orgId_email_idx" ON "TournamentPlayer"("orgId", "email");

-- CreateIndex
CREATE INDEX "TournamentTeam_orgId_idx" ON "TournamentTeam"("orgId");

-- CreateIndex
CREATE INDEX "TournamentTeam_tournamentId_idx" ON "TournamentTeam"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentTeamPlayer_orgId_idx" ON "TournamentTeamPlayer"("orgId");

-- CreateIndex
CREATE INDEX "TournamentTeamPlayer_tournamentId_idx" ON "TournamentTeamPlayer"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentTeamPlayer_teamId_idx" ON "TournamentTeamPlayer"("teamId");

-- CreateIndex
CREATE INDEX "TournamentTeamPlayer_playerId_idx" ON "TournamentTeamPlayer"("playerId");

-- CreateIndex
CREATE INDEX "TournamentTeamPlayer_stripeCheckoutSessionId_idx" ON "TournamentTeamPlayer"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeamPlayer_teamId_playerId_key" ON "TournamentTeamPlayer"("teamId", "playerId");

-- CreateIndex
CREATE INDEX "TournamentLog_orgId_createdAt_idx" ON "TournamentLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentLog_tournamentId_createdAt_idx" ON "TournamentLog"("tournamentId", "createdAt");

-- AddForeignKey
ALTER TABLE "TournamentType" ADD CONSTRAINT "TournamentType_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TournamentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_previousTournamentId_fkey" FOREIGN KEY ("previousTournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamPlayer" ADD CONSTRAINT "TournamentTeamPlayer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamPlayer" ADD CONSTRAINT "TournamentTeamPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamPlayer" ADD CONSTRAINT "TournamentTeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TournamentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamPlayer" ADD CONSTRAINT "TournamentTeamPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "TournamentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentLog" ADD CONSTRAINT "TournamentLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentLog" ADD CONSTRAINT "TournamentLog_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
