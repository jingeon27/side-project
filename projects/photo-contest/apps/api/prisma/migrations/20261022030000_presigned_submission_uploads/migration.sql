ALTER TABLE "Upload" ADD COLUMN "mediaUploadId" TEXT;
CREATE UNIQUE INDEX "Upload_mediaUploadId_key" ON "Upload"("mediaUploadId");
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_mediaUploadId_fkey"
FOREIGN KEY ("mediaUploadId") REFERENCES "PostUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
