-- CreateTable
CREATE TABLE "TournamentEmailSuppression" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentEmailSuppression_orgId_idx" ON "TournamentEmailSuppression"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEmailSuppression_orgId_email_key" ON "TournamentEmailSuppression"("orgId", "email");

-- AddForeignKey
ALTER TABLE "TournamentEmailSuppression" ADD CONSTRAINT "TournamentEmailSuppression_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
