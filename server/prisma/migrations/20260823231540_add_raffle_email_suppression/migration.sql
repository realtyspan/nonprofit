-- CreateTable
CREATE TABLE "RaffleEmailSuppression" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleEmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaffleEmailSuppression_orgId_idx" ON "RaffleEmailSuppression"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleEmailSuppression_orgId_email_key" ON "RaffleEmailSuppression"("orgId", "email");

-- AddForeignKey
ALTER TABLE "RaffleEmailSuppression" ADD CONSTRAINT "RaffleEmailSuppression_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
