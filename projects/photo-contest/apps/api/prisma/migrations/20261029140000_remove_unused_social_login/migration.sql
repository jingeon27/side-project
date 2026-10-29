-- Runtime readers and writers were retired before this release. Session and User tables are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- migration-lint: allow DROP TABLE — unused app-login tickets; no runtime reader remains after #112
DROP TABLE "AppLoginTicket";
-- migration-lint: allow DROP TABLE — unused OAuth attempts; no runtime reader remains after #112
DROP TABLE "OAuthAttempt";
COMMIT;
