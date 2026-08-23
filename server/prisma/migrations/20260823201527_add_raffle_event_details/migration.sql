-- AlterTable
ALTER TABLE "RaffleGame" ADD COLUMN     "admitsPerTicket" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "eventDetails" TEXT,
ADD COLUMN     "eventDoorsOpenTime" TEXT,
ADD COLUMN     "eventVenue" TEXT,
ADD COLUMN     "minimumTicketsSold" INTEGER;
