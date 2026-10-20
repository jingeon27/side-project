-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'LEGACY';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "contestId" TEXT;

-- CreateTable
CREATE TABLE "PostContestVote" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostContestVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostContestVote_postId_idx" ON "PostContestVote"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostContestVote_contestId_voterId_key" ON "PostContestVote"("contestId", "voterId");

-- CreateIndex
CREATE INDEX "Contest_groupId_format_endsAt_id_idx" ON "Contest"("groupId", "format", "endsAt", "id");

-- CreateIndex
CREATE INDEX "Post_contestId_createdAt_id_idx" ON "Post"("contestId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Post_id_contestId_key" ON "Post"("id", "contestId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContestVote" ADD CONSTRAINT "PostContestVote_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContestVote" ADD CONSTRAINT "PostContestVote_postId_contestId_fkey" FOREIGN KEY ("postId", "contestId") REFERENCES "Post"("id", "contestId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContestVote" ADD CONSTRAINT "PostContestVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

