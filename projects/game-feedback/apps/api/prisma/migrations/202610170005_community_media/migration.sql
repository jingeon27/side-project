ALTER TABLE "Post" ADD COLUMN "board" TEXT NOT NULL DEFAULT 'FEEDBACK';
ALTER TABLE "Post" ADD COLUMN "document" JSONB;
CREATE INDEX "Post_board_createdAt_id_idx" ON "Post"("board", "createdAt", "id");
CREATE TABLE "ChatAttachment" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "messageId" TEXT,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatAttachment_size_check" CHECK ("size" > 0 AND "size" <= 26214400)
);
CREATE INDEX "ChatAttachment_conversationId_messageId_idx" ON "ChatAttachment"("conversationId", "messageId");
CREATE INDEX "ChatAttachment_uploaderId_createdAt_idx" ON "ChatAttachment"("uploaderId", "createdAt");
