-- AlterTable
ALTER TABLE "PostComment" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "PostComment_postId_parentId_createdAt_id_idx" ON "PostComment"("postId", "parentId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PostComment_id_postId_key" ON "PostComment"("id", "postId");

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_parentId_postId_fkey" FOREIGN KEY ("parentId", "postId") REFERENCES "PostComment"("id", "postId") ON DELETE CASCADE ON UPDATE CASCADE;

