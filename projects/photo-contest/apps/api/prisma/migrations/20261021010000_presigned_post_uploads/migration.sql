ALTER TABLE "PostUpload" ADD COLUMN "stagingKey" TEXT,
ADD COLUMN "completionKey" TEXT,
ADD COLUMN "completionStartedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PostUpload_stagingKey_key" ON "PostUpload"("stagingKey");
CREATE UNIQUE INDEX "PostUpload_completionKey_key" ON "PostUpload"("completionKey");
CREATE TABLE "PostUploadAttempt" (
  "key" TEXT NOT NULL,
  "uploadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostUploadAttempt_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "PostUploadAttempt_createdAt_idx" ON "PostUploadAttempt"("createdAt");
CREATE INDEX "PostUploadAttempt_uploadId_idx" ON "PostUploadAttempt"("uploadId");
ALTER TABLE "PostUploadAttempt" ADD CONSTRAINT "PostUploadAttempt_uploadId_fkey"
FOREIGN KEY ("uploadId") REFERENCES "PostUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
