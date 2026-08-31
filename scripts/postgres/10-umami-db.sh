#!/bin/sh
# Creates the database Umami owns.
#
# Umami gets its own database rather than sharing the Directus one (ADR-006):
# Directus introspects the database it is pointed at, and sharing would put
# Umami's tables in front of every editor browsing the admin.
#
# ⚠ Postgres runs /docker-entrypoint-initdb.d ONLY when the data directory is
# empty — that is, on a fresh volume. An existing checkout already has a
# populated pg_data volume, so this will NOT run for anyone who set the project
# up before analytics existed. For those, once:
#
#   docker compose exec postgres createdb -U "$POSTGRES_USER" umami
#
# The symptom of skipping it is the umami container restarting with a
# "database umami does not exist" error, which is at least loud.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	SELECT 'CREATE DATABASE ${UMAMI_DB:-umami}'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${UMAMI_DB:-umami}')\gexec
EOSQL
