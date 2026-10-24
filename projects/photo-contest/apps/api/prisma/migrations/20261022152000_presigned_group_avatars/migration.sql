-- AlterTable
ALTER TABLE "GroupAvatar" ADD COLUMN     "mediaUploadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GroupAvatar_mediaUploadId_key" ON "GroupAvatar"("mediaUploadId");

-- AddForeignKey
ALTER TABLE "GroupAvatar" ADD CONSTRAINT "GroupAvatar_mediaUploadId_fkey" FOREIGN KEY ("mediaUploadId") REFERENCES "PostUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

