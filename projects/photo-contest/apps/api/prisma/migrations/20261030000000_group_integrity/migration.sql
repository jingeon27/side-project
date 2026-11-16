-- PK를 포함한 참조 키는 중복이 없다. 큰 표는 같은 이름으로 사전 빌드하며 격리 스키마의 병렬 migration 교착을 피한다.
-- migration-lint: allow CREATE UNIQUE INDEX — 기존 PK를 포함한 복합 참조 키이며 알파 규모에서 병렬 migration 교착을 피한다
CREATE UNIQUE INDEX IF NOT EXISTS "Contest_id_groupId_key" ON "Contest"("id", "groupId");
-- migration-lint: allow CREATE UNIQUE INDEX — 기존 PK를 포함한 복합 참조 키이며 알파 규모에서 병렬 migration 교착을 피한다
CREATE UNIQUE INDEX IF NOT EXISTS "PostUpload_id_groupId_userId_key" ON "PostUpload"("id", "groupId", "userId");

-- 단일 FK의 SET NULL이 contestId만 비운 뒤 복합 FK를 검사한다. 필수 groupId는 그대로 남는다.
ALTER TABLE "Post" ADD CONSTRAINT "Post_contestId_groupId_fkey"
  FOREIGN KEY ("contestId", "groupId") REFERENCES "Contest"("id", "groupId") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Post" VALIDATE CONSTRAINT "Post_contestId_groupId_fkey";
ALTER TABLE "Post" ADD CONSTRAINT "Post_uploadId_groupId_authorId_fkey"
  FOREIGN KEY ("uploadId", "groupId", "authorId") REFERENCES "PostUpload"("id", "groupId", "userId") ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Post" VALIDATE CONSTRAINT "Post_uploadId_groupId_authorId_fkey";

ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_role_check"
  CHECK ("role" IN ('OWNER', 'MODERATOR', 'MEMBER')) NOT VALID;
ALTER TABLE "GroupMember" VALIDATE CONSTRAINT "GroupMember_role_check";
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_schedule_check"
  CHECK ("startsAt" < "submissionEndsAt" AND "submissionEndsAt" < "endsAt") NOT VALID;
ALTER TABLE "Contest" VALIDATE CONSTRAINT "Contest_schedule_check";
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_likeLimit_check"
  CHECK ("likeLimit" BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE "Contest" VALIDATE CONSTRAINT "Contest_likeLimit_check";
-- 최소 한 명은 생성·양도 트랜잭션이 지킨다. 이 인덱스는 OWNER가 두 명 생기는 것을 막는다.
-- migration-lint: allow CREATE UNIQUE INDEX — 기존 그룹장 중복은 배포 전 점검하며 알파 규모에서 병렬 migration 교착을 피한다
CREATE UNIQUE INDEX IF NOT EXISTS "GroupMember_one_owner_key" ON "GroupMember"("groupId") WHERE "role" = 'OWNER';
