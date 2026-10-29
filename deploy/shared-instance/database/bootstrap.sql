-- Run once as the container superuser on a new cluster: bash deploy/shared-instance/scripts/database.sh bootstrap
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
CREATE DATABASE game_feedback OWNER game_feedback_migrator;
CREATE DATABASE photo_contest OWNER photo_contest_migrator;
REVOKE ALL ON DATABASE game_feedback FROM PUBLIC;
REVOKE ALL ON DATABASE photo_contest FROM PUBLIC;
GRANT CONNECT ON DATABASE game_feedback TO game_feedback;
GRANT CONNECT ON DATABASE photo_contest TO photo_contest;
-- Service roles must not open the maintenance databases either. pg_hba.conf already limits each role to its own
-- database; the grants keep that true if the file is ever loosened.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
\connect game_feedback
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO game_feedback;
\connect photo_contest
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO photo_contest;
-- Migration tooling grants business-table DML and excludes _prisma_migrations atomically.
