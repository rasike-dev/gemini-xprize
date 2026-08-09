-- ============================================================================
-- Row-Level Security for LedgerPilot AI multi-tenancy.
--
-- This is a tracked migration rather than a script run by hand, because RLS is
-- the only thing standing between one customer's books and another's. A fresh
-- database that has had `migrate deploy` run against it is isolated; there is no
-- separate step left to forget.
--
-- The runtime role (ledgerpilot_app) is not a superuser and does not have
-- BYPASSRLS, so these policies apply to every query it runs. The app sets the
-- tenant per transaction with:
--     SELECT set_config('app.tenant_id', $1, true);
--
-- IMPORTANT: any new tenant-scoped table must be added to tenant_tables below in
-- a follow-up migration. apps/api/test/rls.spec.ts fails if one is missed.
-- ============================================================================

-- Current tenant from the transaction-local setting.
CREATE OR REPLACE FUNCTION app_current_tenant()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.tenant_id', true);
$$;

-- Auth bootstrap: resolve a Clerk org id -> internal tenant id without a tenant
-- context. SECURITY DEFINER lets the app role read this one mapping safely; it
-- still cannot select tenant rows directly.
CREATE OR REPLACE FUNCTION resolve_tenant_id(p_clerk_org_id text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM tenants WHERE "clerkOrgId" = p_clerk_org_id LIMIT 1;
$$;

-- Billing bootstrap: map one of our own payment order ids -> tenant id. The
-- PayHere notify callback arrives with no tenant context, and the tenant id it
-- echoes back sits outside the signed payload so it cannot be trusted. This
-- resolves it from the row we wrote when the checkout started.
CREATE OR REPLACE FUNCTION resolve_billing_order_tenant(p_order_id text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT "tenantId" FROM billing_payments WHERE "orderId" = p_order_id LIMIT 1;
$$;

-- Cross-tenant enumeration for scheduled jobs (overdue scan, daily summaries).
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
    'tenants', 'users', 'subscriptions', 'billing_payments', 'audit_logs',
    'customers', 'inquiries',
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

-- Grant the runtime role access to what it needs.
--
-- The role itself is created outside migrations: by Terraform in production, and
-- by prisma/sql/app-role.sql locally and in CI. A migration must never invent a
-- production password, so if the role is absent the grants are simply skipped
-- and re-applying this migration later will pick them up.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerpilot_app') THEN
    GRANT USAGE ON SCHEMA public TO ledgerpilot_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgerpilot_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgerpilot_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgerpilot_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO ledgerpilot_app;
  ELSE
    RAISE NOTICE 'Role ledgerpilot_app does not exist; skipping grants.';
  END IF;
END $$;
