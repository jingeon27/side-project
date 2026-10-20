ALTER TABLE "PostMedia" ADD COLUMN "uploadedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_published_upload_ready"
  CHECK ("postId" IS NULL OR "uploadedAt" IS NOT NULL);
ALTER TABLE "ChatAttachment" ADD COLUMN "uploadedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_sent_upload_ready"
  CHECK ("messageId" IS NULL OR "uploadedAt" IS NOT NULL);
