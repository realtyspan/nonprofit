-- CreateTable
CREATE TABLE "RentalLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "actorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalLog_orgId_createdAt_idx" ON "RentalLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "RentalLog_bookingId_createdAt_idx" ON "RentalLog"("bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "RentalLog" ADD CONSTRAINT "RentalLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalLog" ADD CONSTRAINT "RentalLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
