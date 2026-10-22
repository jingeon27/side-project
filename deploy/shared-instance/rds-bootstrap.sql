-- Run once as the RDS administrator with psql and verified TLS, in a new RDS instance.
-- No password is recorded here. psql \password prompts without echoing or logging cleartext.
\set ON_ERROR_STOP on
CREATE ROLE game_feedback LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE game_feedback_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE photo_contest LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE photo_contest_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password game_feedback
\password game_feedback_migrator
\password photo_contest
\password photo_contest_migrator
GRANT game_feedback_migrator, photo_contest_migrator TO CURRENT_USER;
CREATE DATABASE game_feedback OWNER game_feedback_migrator;
CREATE DATABASE photo_contest OWNER photo_contest_migrator;
REVOKE ALL ON DATABASE game_feedback FROM PUBLIC;
REVOKE ALL ON DATABASE photo_contest FROM PUBLIC;
GRANT CONNECT ON DATABASE game_feedback TO game_feedback;
GRANT CONNECT ON DATABASE photo_contest TO photo_contest;
-- Service roles must not open the maintenance databases either. The owner keeps access; if the administrator is
-- not the owner, PostgreSQL only warns and leaves the grant unchanged.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
\connect game_feedback
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO game_feedback;
\connect photo_contest
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO photo_contest;
-- Migration tooling grants business-table DML and excludes _prisma_migrations atomically.
