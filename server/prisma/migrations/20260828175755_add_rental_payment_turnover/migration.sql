-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "rentalsFundsContactEmail" TEXT;

-- AlterTable
ALTER TABLE "RentalPayment" ADD COLUMN     "turnedOverAt" TIMESTAMP(3),
ADD COLUMN     "turnedOverToName" TEXT;
