-- CreateTable
CREATE TABLE "RaffleSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "totalTickets" INTEGER NOT NULL DEFAULT 400,
    "ticketPrice" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "currentYear" INTEGER NOT NULL,
    "yearStartedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleTicket" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "buyer" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "assignedSellerId" TEXT,
    "assignedSellerName" TEXT NOT NULL DEFAULT '',
    "soldByUserId" TEXT,
    "soldByName" TEXT NOT NULL DEFAULT '',
    "soldAt" TIMESTAMP(3),
    "tenderType" TEXT,
    "tenderAmount" DOUBLE PRECISION,
    "checkNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleTicketHistory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "buyer" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3),
    "sellerName" TEXT NOT NULL DEFAULT '',
    "tenderType" TEXT,
    "tenderAmount" DOUBLE PRECISION,
    "checkNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleTicketHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL DEFAULT '',
    "ticketNumber" INTEGER,
    "assignedSellerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleLogArchive" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "archivedYear" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL DEFAULT '',
    "ticketNumber" INTEGER,
    "assignedSellerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleLogArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleDrawing" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "drawingDate" TIMESTAMP(3) NOT NULL,
    "drawingType" TEXT NOT NULL,
    "prizeAmount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "winningTicket" INTEGER,
    "winningBuyer" TEXT NOT NULL DEFAULT '',
    "winningPhone" TEXT NOT NULL DEFAULT '',
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "drawnAt" TIMESTAMP(3),
    "drawnByName" TEXT NOT NULL DEFAULT '',
    "drawMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleDrawingArchive" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "archivedYear" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "drawingDate" TIMESTAMP(3) NOT NULL,
    "drawingType" TEXT NOT NULL,
    "prizeAmount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "winningTicket" INTEGER,
    "winningBuyer" TEXT NOT NULL DEFAULT '',
    "winningPhone" TEXT NOT NULL DEFAULT '',
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "drawnAt" TIMESTAMP(3),
    "drawnByName" TEXT NOT NULL DEFAULT '',
    "drawMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleDrawingArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleRenewalCall" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "calledByUserId" TEXT,
    "calledByName" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleRenewalCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleCheckIn" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "hasGuest" BOOLEAN NOT NULL DEFAULT false,
    "checkedInByUserId" TEXT,
    "checkedInByName" TEXT NOT NULL DEFAULT '',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaffleSettings_orgId_key" ON "RaffleSettings"("orgId");

-- CreateIndex
CREATE INDEX "RaffleTicket_orgId_idx" ON "RaffleTicket"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleTicket_orgId_number_key" ON "RaffleTicket"("orgId", "number");

-- CreateIndex
CREATE INDEX "RaffleTicketHistory_orgId_ticketNumber_idx" ON "RaffleTicketHistory"("orgId", "ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleTicketHistory_orgId_year_ticketNumber_key" ON "RaffleTicketHistory"("orgId", "year", "ticketNumber");

-- CreateIndex
CREATE INDEX "RaffleLog_orgId_createdAt_idx" ON "RaffleLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "RaffleLogArchive_orgId_archivedYear_idx" ON "RaffleLogArchive"("orgId", "archivedYear");

-- CreateIndex
CREATE INDEX "RaffleDrawing_orgId_year_idx" ON "RaffleDrawing"("orgId", "year");

-- CreateIndex
CREATE INDEX "RaffleDrawingArchive_orgId_archivedYear_idx" ON "RaffleDrawingArchive"("orgId", "archivedYear");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleRenewalCall_orgId_year_ticketNumber_key" ON "RaffleRenewalCall"("orgId", "year", "ticketNumber");

-- CreateIndex
CREATE INDEX "RaffleCheckIn_orgId_year_idx" ON "RaffleCheckIn"("orgId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleCheckIn_orgId_year_ticketNumber_key" ON "RaffleCheckIn"("orgId", "year", "ticketNumber");

-- AddForeignKey
ALTER TABLE "RaffleSettings" ADD CONSTRAINT "RaffleSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleTicket" ADD CONSTRAINT "RaffleTicket_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleTicket" ADD CONSTRAINT "RaffleTicket_assignedSellerId_fkey" FOREIGN KEY ("assignedSellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleTicketHistory" ADD CONSTRAINT "RaffleTicketHistory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleLog" ADD CONSTRAINT "RaffleLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleLogArchive" ADD CONSTRAINT "RaffleLogArchive_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleDrawing" ADD CONSTRAINT "RaffleDrawing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleDrawingArchive" ADD CONSTRAINT "RaffleDrawingArchive_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleRenewalCall" ADD CONSTRAINT "RaffleRenewalCall_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleCheckIn" ADD CONSTRAINT "RaffleCheckIn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

