-- CreateTable
CREATE TABLE "hub_apps" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "url" TEXT NOT NULL,
    "iconType" TEXT NOT NULL DEFAULT 'mat-icon',
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hub_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hub_apps_sortOrder_idx" ON "hub_apps"("sortOrder");
