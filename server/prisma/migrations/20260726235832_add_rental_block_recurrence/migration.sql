-- AlterTable
ALTER TABLE "RentalBlock" ADD COLUMN     "recurrenceId" TEXT,
ADD COLUMN     "visibleOnPublicCalendar" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RentalBlockRecurrence" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "reason" TEXT,
    "visibleOnPublicCalendar" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "freq" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "byWeekday" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalBlockRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalBlockRecurrence_orgId_idx" ON "RentalBlockRecurrence"("orgId");

-- CreateIndex
CREATE INDEX "RentalBlockRecurrence_spaceId_idx" ON "RentalBlockRecurrence"("spaceId");

-- CreateIndex
CREATE INDEX "RentalBlock_recurrenceId_idx" ON "RentalBlock"("recurrenceId");

-- AddForeignKey
ALTER TABLE "RentalBlock" ADD CONSTRAINT "RentalBlock_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "RentalBlockRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBlockRecurrence" ADD CONSTRAINT "RentalBlockRecurrence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBlockRecurrence" ADD CONSTRAINT "RentalBlockRecurrence_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "RentalSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

