-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "orgCategoryId" TEXT;

-- CreateTable
CREATE TABLE "OrgCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgCategory_name_key" ON "OrgCategory"("name");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_orgCategoryId_fkey" FOREIGN KEY ("orgCategoryId") REFERENCES "OrgCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
