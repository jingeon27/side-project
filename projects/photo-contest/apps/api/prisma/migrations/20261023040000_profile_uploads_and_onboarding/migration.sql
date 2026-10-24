-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUploadId" TEXT,
ADD COLUMN     "needsOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "ProfileUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "policyExpiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfileUpload_storageKey_key" ON "ProfileUpload"("storageKey");

-- CreateIndex
CREATE INDEX "ProfileUpload_userId_expiresAt_idx" ON "ProfileUpload"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ProfileUpload_expiresAt_idx" ON "ProfileUpload"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarUploadId_key" ON "User"("avatarUploadId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarUploadId_fkey" FOREIGN KEY ("avatarUploadId") REFERENCES "ProfileUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileUpload" ADD CONSTRAINT "ProfileUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

