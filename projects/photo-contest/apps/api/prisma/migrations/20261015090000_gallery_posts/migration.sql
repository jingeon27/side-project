-- CreateTable
CREATE TABLE "PostUpload" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "storageKey" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PHOTO',
    "contentType" TEXT NOT NULL DEFAULT 'image/webp',
    "byteSize" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PostUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacySubmissionId" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostLike" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostUpload_tokenHash_key" ON "PostUpload"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PostUpload_storageKey_key" ON "PostUpload"("storageKey");

-- CreateIndex
CREATE INDEX "PostUpload_expiresAt_idx" ON "PostUpload"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_uploadId_key" ON "Post"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_legacySubmissionId_key" ON "Post"("legacySubmissionId");

-- CreateIndex
CREATE INDEX "Post_groupId_createdAt_id_idx" ON "Post"("groupId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PostLike_userId_idx" ON "PostLike"("userId");

-- AddForeignKey
ALTER TABLE "PostUpload" ADD CONSTRAINT "PostUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostUpload" ADD CONSTRAINT "PostUpload_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_legacySubmissionId_fkey" FOREIGN KEY ("legacySubmissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "PostUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 기존 사진과 좋아요를 상시 갤러리 게시물로 보존한다. 원본 대회 테이블은 유지한다.
INSERT INTO "PostUpload" ("id", "tokenHash", "userId", "groupId", "expiresAt", "storageKey", "kind", "contentType", "byteSize")
SELECT u."id", u."tokenHash", u."userId", c."groupId", u."expiresAt", u."imageKey", 'PHOTO', 'image/webp', 0
FROM "Upload" u JOIN "Submission" s ON s."uploadId" = u."id" JOIN "Contest" c ON c."id" = s."contestId";
INSERT INTO "Post" ("id", "groupId", "authorId", "uploadId", "title", "body", "hidden", "createdAt", "legacySubmissionId")
SELECT s."id", c."groupId", s."authorId", s."uploadId", LEFT(s."caption", 80), s."caption", s."hidden", s."createdAt", s."id"
FROM "Submission" s JOIN "Contest" c ON c."id" = s."contestId";
INSERT INTO "PostLike" ("postId", "userId", "createdAt") SELECT "submissionId", "userId", "createdAt" FROM "Like";
