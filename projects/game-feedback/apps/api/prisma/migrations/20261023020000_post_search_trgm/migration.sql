-- Post search uses Prisma `contains` + `mode: insensitive`, which PostgreSQL runs as ILIKE '%q%'.
-- Trigram GIN indexes let those scans use an index instead of reading every title and body.
-- pg_trgm is a trusted extension (PostgreSQL 13+), so the database owner can create it without superuser:
-- game_feedback_migrator on the shared RDS instance, and the service role locally and in isolated tests.
-- Extensions are per database, so it lives in public and the operator class is schema-qualified for the
-- gf_test_* schemas. Prisma's migrate advisory lock serializes concurrent deploys into the same database.
-- These indexes are raw SQL like the CHECK constraints and are not declared in schema.prisma.
-- Prisma runs a migration in a transaction, so CREATE INDEX CONCURRENTLY is not available here.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- migration-lint: allow CREATE INDEX — 배포 전이라 운영 데이터 없음
CREATE INDEX "Post_title_trgm_idx" ON "Post" USING GIN ("title" public.gin_trgm_ops);

-- migration-lint: allow CREATE INDEX — 배포 전이라 운영 데이터 없음
CREATE INDEX "Post_body_trgm_idx" ON "Post" USING GIN ("body" public.gin_trgm_ops);
