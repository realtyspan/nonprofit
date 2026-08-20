-- CreateTable
CREATE TABLE "RentalPayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT,
    "receiptNum" TEXT,
    "note" TEXT,
    "recordedByName" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalPayment_orgId_idx" ON "RentalPayment"("orgId");

-- CreateIndex
CREATE INDEX "RentalPayment_bookingId_idx" ON "RentalPayment"("bookingId");

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RentalBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

