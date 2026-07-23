-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNum" TEXT NOT NULL,
    "formNum" TEXT NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "ticketPrice" REAL NOT NULL,
    "idealPayout" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "closeThreshold" REAL NOT NULL DEFAULT 0.75,
    "soldToDate" INTEGER NOT NULL DEFAULT 0,
    "prizesAwardedToDate" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("createdAt", "formNum", "id", "idealPayout", "name", "orgId", "prizesAwardedToDate", "serialNum", "soldToDate", "status", "ticketCount", "ticketPrice") SELECT "createdAt", "formNum", "id", "idealPayout", "name", "orgId", "prizesAwardedToDate", "serialNum", "soldToDate", "status", "ticketCount", "ticketPrice" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE INDEX "Deal_orgId_idx" ON "Deal"("orgId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
