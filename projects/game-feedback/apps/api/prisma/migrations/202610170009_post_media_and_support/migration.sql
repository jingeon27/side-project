ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3), ADD COLUMN "banReason" TEXT;

CREATE TABLE "PostMedia" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "uploaderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "postId" TEXT REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PostMedia_uploaderId_postId_createdAt_idx" ON "PostMedia"("uploaderId", "postId", "createdAt");
CREATE INDEX "PostMedia_postId_idx" ON "PostMedia"("postId");

CREATE TABLE "SupportConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requesterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "adminId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "topic" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SupportConversation_conversationId_key" ON "SupportConversation"("conversationId");
CREATE INDEX "SupportConversation_adminId_status_createdAt_idx" ON "SupportConversation"("adminId", "status", "createdAt");
