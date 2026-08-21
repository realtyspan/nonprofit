-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "createdByName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "CalendarEvent_createdByUserId_idx" ON "CalendarEvent"("createdByUserId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
