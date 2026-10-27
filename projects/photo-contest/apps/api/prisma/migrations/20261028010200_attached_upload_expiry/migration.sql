-- 게시물·제출한 대회 사진·현재 그룹 대표·배경 사진에 붙은 업로드는 만료가 없다. 만료를 비워 두면 매분 도는 정리 작업의
-- "expiresAt < 기준 시각" 범위가 지난 업로드 전체를 다시 읽지 않는다. 떼어 낼 때(삭제·교체) 지난 시각으로 되돌린다.
-- 이전 앱은 null 만료를 지난 것으로 읽어 이미 붙은 업로드의 완료 재시도·재게시만 거절하고, 정리 작업은 null 행을 건너뛴다.
-- migration-lint: allow DROP NOT NULL — 붙은 업로드의 만료 없음을 null로 표시한다. 이전 앱도 읽기만 하면 그대로 동작한다
ALTER TABLE "PostUpload" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- 지금 붙어 있는 업로드의 만료를 비운다.
UPDATE "PostUpload" SET "expiresAt" = NULL
WHERE EXISTS (SELECT 1 FROM "Post" WHERE "Post"."uploadId" = "PostUpload"."id")
  OR EXISTS (
    SELECT 1 FROM "Upload" JOIN "Submission" ON "Submission"."uploadId" = "Upload"."id"
    WHERE "Upload"."mediaUploadId" = "PostUpload"."id"
  )
  OR EXISTS (
    SELECT 1 FROM "GroupAvatar"
    JOIN "Group" ON "Group"."avatarId" = "GroupAvatar"."id" OR "Group"."coverId" = "GroupAvatar"."id"
    WHERE "GroupAvatar"."mediaUploadId" = "PostUpload"."id"
  );
