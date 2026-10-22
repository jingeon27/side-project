-- 대표 사진을 올린 사용자를 지우면 PostUpload가 cascade로 지워지는데, 그 행을 가리키는 GroupAvatar의
-- RESTRICT 때문에 사용자 삭제 전체가 실패했다. 대표 사진은 자기 storageKey를 따로 가지므로 연결만 끊는다.
-- migration-lint: allow DROP CONSTRAINT — 배포 전이라 운영 데이터 없음, 같은 FK를 동작만 바꿔 다시 만든다
ALTER TABLE "GroupAvatar" DROP CONSTRAINT "GroupAvatar_mediaUploadId_fkey";

ALTER TABLE "GroupAvatar" ADD CONSTRAINT "GroupAvatar_mediaUploadId_fkey" FOREIGN KEY ("mediaUploadId") REFERENCES "PostUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "GroupAvatar" VALIDATE CONSTRAINT "GroupAvatar_mediaUploadId_fkey";
