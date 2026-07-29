-- CreateTable
CREATE TABLE "OrgMembership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleGrant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierLabel" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ownerLabel" TEXT,
    "viewerLabel" TEXT,
    "adminLabel" TEXT,
    "helperLabel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GC7QSignerDesignation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GC7QSignerDesignation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgMembership_userId_key" ON "OrgMembership"("userId");

-- CreateIndex
CREATE INDEX "OrgMembership_orgId_idx" ON "OrgMembership"("orgId");

-- CreateIndex
CREATE INDEX "ModuleGrant_orgId_idx" ON "ModuleGrant"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleGrant_userId_module_key" ON "ModuleGrant"("userId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "TierLabel_orgId_key" ON "TierLabel"("orgId");

-- CreateIndex
CREATE INDEX "GC7QSignerDesignation_orgId_idx" ON "GC7QSignerDesignation"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "GC7QSignerDesignation_orgId_slot_key" ON "GC7QSignerDesignation"("orgId", "slot");

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleGrant" ADD CONSTRAINT "ModuleGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleGrant" ADD CONSTRAINT "ModuleGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierLabel" ADD CONSTRAINT "TierLabel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GC7QSignerDesignation" ADD CONSTRAINT "GC7QSignerDesignation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GC7QSignerDesignation" ADD CONSTRAINT "GC7QSignerDesignation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

