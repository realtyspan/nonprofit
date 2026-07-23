-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GC7QReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "values" TEXT NOT NULL,
    "interestEarned" REAL NOT NULL DEFAULT 0,
    "adjustments" REAL NOT NULL DEFAULT 0,
    "adjustmentExplanation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GC7QReport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GC7QReport" ("createdAt", "id", "orgId", "quarter", "status", "values", "year") SELECT "createdAt", "id", "orgId", "quarter", "status", "values", "year" FROM "GC7QReport";
DROP TABLE "GC7QReport";
ALTER TABLE "new_GC7QReport" RENAME TO "GC7QReport";
CREATE INDEX "GC7QReport_orgId_idx" ON "GC7QReport"("orgId");
CREATE UNIQUE INDEX "GC7QReport_orgId_year_quarter_key" ON "GC7QReport"("orgId", "year", "quarter");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
