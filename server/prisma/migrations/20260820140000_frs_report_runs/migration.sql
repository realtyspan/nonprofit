-- CreateTable
CREATE TABLE "FrsReportRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "csvFile" TEXT NOT NULL,
    "csvFileName" TEXT NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "totalDebits" DOUBLE PRECISION NOT NULL,
    "totalCredits" DOUBLE PRECISION NOT NULL,
    "generatedByName" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrsReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FrsReportRun_orgId_idx" ON "FrsReportRun"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FrsReportRun_orgId_year_month_key" ON "FrsReportRun"("orgId", "year", "month");

-- AddForeignKey
ALTER TABLE "FrsReportRun" ADD CONSTRAINT "FrsReportRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
