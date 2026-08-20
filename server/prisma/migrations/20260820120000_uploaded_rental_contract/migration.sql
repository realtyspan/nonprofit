-- AlterTable
ALTER TABLE "RentalBooking" ADD COLUMN     "uploadedContractAt" TIMESTAMP(3),
ADD COLUMN     "uploadedContractFile" TEXT,
ADD COLUMN     "uploadedContractFileName" TEXT;

