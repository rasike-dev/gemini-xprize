-- ============================================================================
-- Creates the non-superuser runtime role used by the API and worker.
--
-- FOR LOCAL DEVELOPMENT AND CI ONLY. In production Terraform creates this role
-- with a generated password held in Secret Manager (see infra/terraform/main.tf),
-- which is why the role is not created by a migration: a migration cannot know
-- the production password and must never hardcode one.
--
-- Run this BEFORE `prisma migrate deploy`, so the RLS migration has a role to
-- grant privileges to:
--     psql "$DATABASE_URL" -f packages/db/prisma/sql/app-role.sql
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerpilot_app') THEN
    CREATE ROLE ledgerpilot_app LOGIN PASSWORD 'ledgerpilot_app';
  END IF;
END $$;
