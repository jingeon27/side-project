#!/usr/bin/env bash
set -euo pipefail
psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=app_password="$GF_DB_PASSWORD" <<'SQL'
CREATE ROLE game_feedback LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE game_feedback OWNER game_feedback;
SQL
