-- CreateTable
CREATE TABLE "BannedIdentity" (
    "provider" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedIdentity_pkey" PRIMARY KEY ("provider","subjectHash")
);

-- CreateIndex
CREATE INDEX "BannedIdentity_userId_idx" ON "BannedIdentity"("userId");

