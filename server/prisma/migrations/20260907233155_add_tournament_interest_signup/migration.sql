-- CreateTable
CREATE TABLE "TournamentInterestSignup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "companyName" TEXT,
    "note" TEXT,
    "typeId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentInterestSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentInterestSignup_orgId_idx" ON "TournamentInterestSignup"("orgId");

-- CreateIndex
CREATE INDEX "TournamentInterestSignup_typeId_idx" ON "TournamentInterestSignup"("typeId");

-- AddForeignKey
ALTER TABLE "TournamentInterestSignup" ADD CONSTRAINT "TournamentInterestSignup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentInterestSignup" ADD CONSTRAINT "TournamentInterestSignup_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TournamentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
