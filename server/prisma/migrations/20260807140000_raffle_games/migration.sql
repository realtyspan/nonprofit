-- DropForeignKey
ALTER TABLE "RaffleDrawingArchive" DROP CONSTRAINT "RaffleDrawingArchive_orgId_fkey";

-- DropForeignKey
ALTER TABLE "RaffleLogArchive" DROP CONSTRAINT "RaffleLogArchive_orgId_fkey";

-- DropForeignKey
ALTER TABLE "RaffleSettings" DROP CONSTRAINT "RaffleSettings_orgId_fkey";

-- DropForeignKey
ALTER TABLE "RaffleTicketHistory" DROP CONSTRAINT "RaffleTicketHistory_orgId_fkey";

-- DropIndex
DROP INDEX "RaffleCheckIn_orgId_year_idx";

-- DropIndex
DROP INDEX "RaffleCheckIn_orgId_year_ticketNumber_key";

-- DropIndex
DROP INDEX "RaffleDrawing_orgId_year_idx";

-- DropIndex
DROP INDEX "RaffleRenewalCall_orgId_year_ticketNumber_key";

-- DropIndex
DROP INDEX "RaffleTicket_orgId_idx";

-- DropIndex
DROP INDEX "RaffleTicket_orgId_number_key";

-- AlterTable
ALTER TABLE "RaffleCheckIn" DROP COLUMN "year",
ADD COLUMN     "gameId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RaffleDrawing" DROP COLUMN "year",
ADD COLUMN     "gameId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RaffleLog" ADD COLUMN     "gameId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RaffleRenewalCall" DROP COLUMN "year",
ADD COLUMN     "gameId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RaffleTicket" ADD COLUMN     "gameId" TEXT NOT NULL;

-- DropTable
DROP TABLE "RaffleDrawingArchive";

-- DropTable
DROP TABLE "RaffleLogArchive";

-- DropTable
DROP TABLE "RaffleSettings";

-- DropTable
DROP TABLE "RaffleTicketHistory";

-- CreateTable
CREATE TABLE "RaffleGame" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startNumber" INTEGER NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "totalTickets" INTEGER NOT NULL,
    "ticketPrice" DOUBLE PRECISION NOT NULL,
    "raffleStartDate" TIMESTAMP(3) NOT NULL,
    "raffleEndDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaffleGame_orgId_idx" ON "RaffleGame"("orgId");

-- CreateIndex
CREATE INDEX "RaffleGame_orgId_status_idx" ON "RaffleGame"("orgId", "status");

-- CreateIndex
CREATE INDEX "RaffleCheckIn_gameId_idx" ON "RaffleCheckIn"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleCheckIn_gameId_ticketNumber_key" ON "RaffleCheckIn"("gameId", "ticketNumber");

-- CreateIndex
CREATE INDEX "RaffleDrawing_orgId_idx" ON "RaffleDrawing"("orgId");

-- CreateIndex
CREATE INDEX "RaffleDrawing_gameId_idx" ON "RaffleDrawing"("gameId");

-- CreateIndex
CREATE INDEX "RaffleLog_gameId_createdAt_idx" ON "RaffleLog"("gameId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleRenewalCall_gameId_ticketNumber_key" ON "RaffleRenewalCall"("gameId", "ticketNumber");

-- CreateIndex
CREATE INDEX "RaffleTicket_orgId_number_idx" ON "RaffleTicket"("orgId", "number");

-- CreateIndex
CREATE INDEX "RaffleTicket_gameId_idx" ON "RaffleTicket"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleTicket_gameId_number_key" ON "RaffleTicket"("gameId", "number");

-- AddForeignKey
ALTER TABLE "RaffleGame" ADD CONSTRAINT "RaffleGame_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleTicket" ADD CONSTRAINT "RaffleTicket_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RaffleGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleLog" ADD CONSTRAINT "RaffleLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RaffleGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleDrawing" ADD CONSTRAINT "RaffleDrawing_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RaffleGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleRenewalCall" ADD CONSTRAINT "RaffleRenewalCall_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RaffleGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleCheckIn" ADD CONSTRAINT "RaffleCheckIn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RaffleGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

