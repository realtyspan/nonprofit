-- AlterTable
ALTER TABLE "RaffleGame" ADD COLUMN     "previousGameId" TEXT;

-- CreateIndex
CREATE INDEX "RaffleGame_previousGameId_idx" ON "RaffleGame"("previousGameId");

-- AddForeignKey
ALTER TABLE "RaffleGame" ADD CONSTRAINT "RaffleGame_previousGameId_fkey" FOREIGN KEY ("previousGameId") REFERENCES "RaffleGame"("id") ON DELETE SET NULL ON UPDATE CASCADE;
