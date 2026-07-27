-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "RentalSpace" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "blockHours" INTEGER NOT NULL DEFAULT 4,
    "baseRateMember" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseRateNonMember" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overageRateMember" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overageRateNonMember" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "offersBartender" BOOLEAN NOT NULL DEFAULT false,
    "bartenderBaseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bartenderOverageRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roundTableFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "longTableFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chairFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kitchenNoOvenFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kitchenWithOvenFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chafingDishFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalBooking" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inquiry',
    "renterName" TEXT NOT NULL,
    "renterEmail" TEXT NOT NULL,
    "renterPhone" TEXT,
    "renterAddress" TEXT,
    "isMember" BOOLEAN NOT NULL DEFAULT false,
    "eventType" TEXT,
    "expectedGuests" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "wantsBartender" BOOLEAN NOT NULL DEFAULT false,
    "roundTables" INTEGER NOT NULL DEFAULT 0,
    "longTables" INTEGER NOT NULL DEFAULT 0,
    "chairs" INTEGER NOT NULL DEFAULT 0,
    "kitchenUse" TEXT,
    "chafingDishes" INTEGER NOT NULL DEFAULT 0,
    "quotedTotal" DOUBLE PRECISION,
    "depositAmount" DOUBLE PRECISION,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "depositMethod" TEXT,
    "depositReceivedAt" TIMESTAMP(3),
    "depositReceiptNum" TEXT,
    "balancePaid" BOOLEAN NOT NULL DEFAULT false,
    "balanceMethod" TEXT,
    "balancePaidAt" TIMESTAMP(3),
    "notes" TEXT,
    "declineReason" TEXT,
    "contractSignedName" TEXT,
    "contractSignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalBlock" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalSpace_orgId_idx" ON "RentalSpace"("orgId");

-- CreateIndex
CREATE INDEX "RentalBooking_orgId_idx" ON "RentalBooking"("orgId");

-- CreateIndex
CREATE INDEX "RentalBooking_spaceId_idx" ON "RentalBooking"("spaceId");

-- CreateIndex
CREATE INDEX "RentalBlock_orgId_idx" ON "RentalBlock"("orgId");

-- CreateIndex
CREATE INDEX "RentalBlock_spaceId_idx" ON "RentalBlock"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- AddForeignKey
ALTER TABLE "RentalSpace" ADD CONSTRAINT "RentalSpace_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBooking" ADD CONSTRAINT "RentalBooking_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "RentalSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBlock" ADD CONSTRAINT "RentalBlock_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalBlock" ADD CONSTRAINT "RentalBlock_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "RentalSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

