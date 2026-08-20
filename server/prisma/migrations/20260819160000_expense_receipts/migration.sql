-- AlterTable
ALTER TABLE "Disbursement" ADD COLUMN     "receiptFile" TEXT,
ADD COLUMN     "receiptFileName" TEXT;

-- AlterTable
ALTER TABLE "RaffleExpense" ADD COLUMN     "receiptFile" TEXT,
ADD COLUMN     "receiptFileName" TEXT;

