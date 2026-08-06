-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "CalendarRecurrence" ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "RentalBlock" ADD COLUMN     "calendarEventId" TEXT;

-- CreateIndex
CREATE INDEX "RentalBlock_calendarEventId_idx" ON "RentalBlock"("calendarEventId");

-- AddForeignKey
ALTER TABLE "RentalBlock" ADD CONSTRAINT "RentalBlock_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

