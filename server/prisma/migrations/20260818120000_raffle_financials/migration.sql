-- AlterTable
ALTER TABLE "RaffleGame" ADD COLUMN     "estimatedExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RaffleSignerDesignation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleSignerDesignation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleExpense" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payee" TEXT NOT NULL,
    "checkNum" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RaffleSignerDesignation_orgId_idx" ON "RaffleSignerDesignation"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleSignerDesignation_orgId_slot_key" ON "RaffleSignerDesignation"("orgId", "slot");

-- CreateIndex
CREATE INDEX "RaffleExpense_orgId_idx" ON "RaffleExpense"("orgId");

-- CreateIndex
CREATE INDEX "RaffleExpense_gameId_idx" ON "RaffleExpense"("gameId");

-- AddForeignKey
ALTER TABLE "RaffleSignerDesignation" ADD CONSTRAINT "RaffleSignerDesignation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleSignerDesignation" ADD CONSTRAINT "RaffleSignerDesignation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleExpense" ADD CONSTRAINT "RaffleExpense_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleExpense" ADD CONSTRAINT "RaffleExpense_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RaffleGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

