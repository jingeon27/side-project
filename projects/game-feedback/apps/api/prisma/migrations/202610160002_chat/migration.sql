-- Additive private chat tables. Existing feedback tables and rows remain unchanged.
CREATE TABLE "ChatConversation" (
  "id" TEXT NOT NULL,
  "firstUserId" TEXT NOT NULL,
  "secondUserId" TEXT NOT NULL,
  "firstReadAt" TIMESTAMP(3),
  "firstReadId" TEXT,
  "secondReadAt" TIMESTAMP(3),
  "secondReadId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatConversation_canonical_pair" CHECK ("firstUserId" COLLATE "C" < "secondUserId" COLLATE "C")
);
CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "clientMessageId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatConversation_firstUserId_secondUserId_key" ON "ChatConversation"("firstUserId", "secondUserId");
CREATE INDEX "ChatConversation_firstUserId_updatedAt_id_idx" ON "ChatConversation"("firstUserId", "updatedAt", "id");
CREATE INDEX "ChatConversation_secondUserId_updatedAt_id_idx" ON "ChatConversation"("secondUserId", "updatedAt", "id");
CREATE UNIQUE INDEX "ChatMessage_senderId_clientMessageId_key" ON "ChatMessage"("senderId", "clientMessageId");
CREATE INDEX "ChatMessage_conversationId_createdAt_id_idx" ON "ChatMessage"("conversationId", "createdAt", "id");
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_firstUserId_fkey" FOREIGN KEY ("firstUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_secondUserId_fkey" FOREIGN KEY ("secondUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
