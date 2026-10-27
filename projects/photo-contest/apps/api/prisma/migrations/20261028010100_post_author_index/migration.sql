-- 내가 올린 게시물(myGalleryPosts: authorId, createdAt·id desc)을 작성자 범위만 읽게 한다.
-- 운영 중인 테이블이라 CONCURRENTLY로 만들고, 트랜잭션 블록을 피하려고 이 파일에는 이 문장 하나만 둔다.
CREATE INDEX CONCURRENTLY "Post_authorId_createdAt_id_idx" ON "Post"("authorId", "createdAt", "id");
