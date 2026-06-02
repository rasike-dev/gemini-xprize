-- ============================================================================
-- Row-Level Security for LedgerPilot AI multi-tenancy.
-- Apply AFTER `prisma migrate deploy` / `prisma db push`.
--
-- The runtime app role (ledgerpilot_app) is NOT a superuser and does NOT have
-- BYPASSRLS, so these policies are enforced for every query it runs.
-- The app sets the current tenant per transaction via:
--     SELECT set_config('app.tenant_id', $1, true);
-- ============================================================================

-- Helper: current tenant from session/transaction setting.
CREATE OR REPLACE FUNCTION app_current_tenant()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.tenant_id', true);
$$;

-- Auth bootstrap: resolve a Clerk org id -> internal tenant id WITHOUT a tenant
-- context. SECURITY DEFINER lets the app role read this single mapping safely
-- (it cannot read tenant rows directly because RLS still applies to SELECT *).
CREATE OR REPLACE FUNCTION resolve_tenant_id(p_clerk_org_id text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM tenants WHERE "clerkOrgId" = p_clerk_org_id LIMIT 1;
$$;

-- Cross-tenant scan for scheduled jobs (overdue scan, daily summaries).
-- SECURITY DEFINER so the app role can enumerate tenant ids without reading rows.
CREATE OR REPLACE FUNCTION all_tenant_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM tenants;
$$;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'tenants', 'users', 'subscriptions', 'customers', 'inquiries',
    'quotes', 'quote_lines', 'invoices', 'invoice_lines',
    'payments', 'reminders', 'agent_runs'
  ];
  id_col text;
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    -- "tenants" keys on id; everything else on "tenantId".
    IF t = 'tenants' THEN
      id_col := 'id';
    ELSE
      id_col := 'tenantId';
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (%I = app_current_tenant())
         WITH CHECK (%I = app_current_tenant());',
      t, id_col, id_col
    );
  END LOOP;
END $$;

-- Runtime role used by API + worker. Password is illustrative; in prod this is
-- provisioned by Terraform and stored in Secret Manager.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerpilot_app') THEN
    CREATE ROLE ledgerpilot_app LOGIN PASSWORD 'ledgerpilot_app';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ledgerpilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgerpilot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgerpilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgerpilot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ledgerpilot_app;
