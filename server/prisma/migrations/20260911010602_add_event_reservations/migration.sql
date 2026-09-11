-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "offersTakeout" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservationDeadline" TIMESTAMP(3),
ADD COLUMN     "reservationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EventReservation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "serviceType" TEXT,
    "pickupTime" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventReservation_orgId_idx" ON "EventReservation"("orgId");

-- CreateIndex
CREATE INDEX "EventReservation_eventId_createdAt_idx" ON "EventReservation"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "EventReservation" ADD CONSTRAINT "EventReservation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReservation" ADD CONSTRAINT "EventReservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
