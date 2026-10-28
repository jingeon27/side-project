-- 사용자별 업로드 용량 합계가 Serializable 트랜잭션에서 PostUpload 전체를 훑지 않게 한다.
-- 운영 중인 테이블이라 쓰기를 막지 않도록 CONCURRENTLY로 만든다. 트랜잭션 블록 안에서는 실행할 수 없으므로
-- Prisma가 한 번의 요청으로 보내는 이 파일에는 이 문장 하나만 둔다.
CREATE INDEX CONCURRENTLY "PostUpload_userId_idx" ON "PostUpload"("userId");
