-- AlterTable
ALTER TABLE "RaffleSettings" ADD COLUMN     "endNumber" INTEGER NOT NULL DEFAULT 400,
ADD COLUMN     "raffleEndDate" TIMESTAMP(3),
ADD COLUMN     "raffleStartDate" TIMESTAMP(3),
ADD COLUMN     "startNumber" INTEGER NOT NULL DEFAULT 1;

