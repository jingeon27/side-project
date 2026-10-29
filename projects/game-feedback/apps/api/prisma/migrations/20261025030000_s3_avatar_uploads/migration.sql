-- CreateTable
CREATE TABLE "AvatarUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AvatarUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarUpload_objectId_key" ON "AvatarUpload"("objectId");

-- CreateIndex
CREATE INDEX "AvatarUpload_userId_expiresAt_idx" ON "AvatarUpload"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AvatarUpload_expiresAt_idx" ON "AvatarUpload"("expiresAt");

-- AddForeignKey
ALTER TABLE "AvatarUpload" ADD CONSTRAINT "AvatarUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarUpload" ADD CONSTRAINT "AvatarUpload_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "MediaObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

