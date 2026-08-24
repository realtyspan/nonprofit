-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrgBilling" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "planName" TEXT,
    "billingAmount" DOUBLE PRECISION,
    "billingCycle" TEXT,
    "renewalDate" TIMESTAMP(3),
    "lastPaymentDate" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSupportNote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformSupportNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgBilling_orgId_key" ON "OrgBilling"("orgId");

-- CreateIndex
CREATE INDEX "PlatformSupportNote_orgId_idx" ON "PlatformSupportNote"("orgId");

-- AddForeignKey
ALTER TABLE "OrgBilling" ADD CONSTRAINT "OrgBilling_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSupportNote" ADD CONSTRAINT "PlatformSupportNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
