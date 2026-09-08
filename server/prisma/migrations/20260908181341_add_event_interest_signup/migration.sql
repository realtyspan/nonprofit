-- CreateTable
CREATE TABLE "EventInterestSignup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "contactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventInterestSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventInterestSignup_orgId_idx" ON "EventInterestSignup"("orgId");

-- AddForeignKey
ALTER TABLE "EventInterestSignup" ADD CONSTRAINT "EventInterestSignup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
