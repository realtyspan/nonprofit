-- CreateTable
CREATE TABLE "GolfInterestSignup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "companyName" TEXT,
    "note" TEXT,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfInterestSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GolfInterestSignup_orgId_idx" ON "GolfInterestSignup"("orgId");

-- AddForeignKey
ALTER TABLE "GolfInterestSignup" ADD CONSTRAINT "GolfInterestSignup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
