ALTER TABLE "Group" ADD COLUMN "coverId" TEXT;
-- migration-lint: allow ADD FOREIGN KEY — 같은 마이그레이션에서 기본값 없는 nullable coverId를 추가하므로 기존 행은 모두 NULL이며 기존 참조를 변경하지 않는다
ALTER TABLE "Group" ADD CONSTRAINT "Group_coverId_id_fkey" FOREIGN KEY ("coverId", "id") REFERENCES "GroupAvatar"("id", "groupId") ON DELETE NO ACTION ON UPDATE NO ACTION;
