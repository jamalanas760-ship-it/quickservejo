-- QuickServe commercial hardening wave 3:
-- tenant API keys, outbound webhooks, manager close reports and menu publication history.
BEGIN;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  key_prefix text NOT NULL CHECK (length(key_prefix) BETWEEN 6 AND 32),
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['menu:read']::text[],
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_restaurant_idx ON public.api_keys(restaurant_id, is_active);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_keys_manage ON public.api_keys;
CREATE POLICY api_keys_manage ON public.api_keys
FOR ALL TO authenticated
USING (app.has_capability(restaurant_id,'manage_restaurant'))
WITH CHECK (app.has_capability(restaurant_id,'manage_restaurant'));
REVOKE ALL ON public.api_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  endpoint_url text NOT NULL CHECK (endpoint_url ~ '^https://'),
  events text[] NOT NULL DEFAULT ARRAY['order.created']::text[],
  secret_ciphertext text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_subscriptions_restaurant_idx ON public.webhook_subscriptions(restaurant_id, is_active);
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_subscriptions_manage ON public.webhook_subscriptions;
CREATE POLICY webhook_subscriptions_manage ON public.webhook_subscriptions
FOR ALL TO authenticated
USING (app.has_capability(restaurant_id,'manage_restaurant'))
WITH CHECK (app.has_capability(restaurant_id,'manage_restaurant'));
REVOKE ALL ON public.webhook_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_subscriptions TO authenticated;
GRANT ALL ON public.webhook_subscriptions TO service_role;
DROP TRIGGER IF EXISTS trg_webhook_subscriptions_updated ON public.webhook_subscriptions;
CREATE TRIGGER trg_webhook_subscriptions_updated BEFORE UPDATE ON public.webhook_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','dead')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  response_status integer,
  response_excerpt text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_retry_idx ON public.webhook_deliveries(status,next_attempt_at) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS webhook_deliveries_restaurant_idx ON public.webhook_deliveries(restaurant_id,created_at DESC);
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_deliveries_select ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_select ON public.webhook_deliveries FOR SELECT TO authenticated
USING (app.has_capability(restaurant_id,'manage_restaurant') OR app.has_capability(restaurant_id,'view_analytics'));
REVOKE ALL ON public.webhook_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;

CREATE TABLE IF NOT EXISTS public.manager_close_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  opened_at timestamptz NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  sales_total numeric(14,3) NOT NULL DEFAULT 0,
  cash_expected numeric(14,3) NOT NULL DEFAULT 0,
  cash_counted numeric(14,3) NOT NULL DEFAULT 0,
  cash_variance numeric(14,3) NOT NULL DEFAULT 0,
  refunds_total numeric(14,3) NOT NULL DEFAULT 0,
  discounts_total numeric(14,3) NOT NULL DEFAULT 0,
  voids_total numeric(14,3) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  labor_minutes integer NOT NULL DEFAULT 0,
  low_stock_count integer NOT NULL DEFAULT 0,
  notes text,
  signed_off_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_off_name text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id,business_date)
);
CREATE INDEX IF NOT EXISTS manager_close_reports_restaurant_idx ON public.manager_close_reports(restaurant_id,business_date DESC);
ALTER TABLE public.manager_close_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_close_reports_select ON public.manager_close_reports;
CREATE POLICY manager_close_reports_select ON public.manager_close_reports FOR SELECT TO authenticated
USING (app.has_capability(restaurant_id,'manage_restaurant') OR app.has_capability(restaurant_id,'view_analytics') OR app.has_capability(restaurant_id,'manage_finance'));
DROP POLICY IF EXISTS manager_close_reports_insert ON public.manager_close_reports;
CREATE POLICY manager_close_reports_insert ON public.manager_close_reports FOR INSERT TO authenticated
WITH CHECK (app.has_capability(restaurant_id,'manage_restaurant') OR app.has_capability(restaurant_id,'manage_finance'));
REVOKE ALL ON public.manager_close_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.manager_close_reports TO authenticated;
GRANT ALL ON public.manager_close_reports TO service_role;

CREATE TABLE IF NOT EXISTS public.menu_publication_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','superseded','rolled_back')),
  snapshot jsonb NOT NULL,
  scheduled_for timestamptz,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_version_id uuid REFERENCES public.menu_publication_versions(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, version_number)
);
CREATE INDEX IF NOT EXISTS menu_publication_versions_restaurant_idx ON public.menu_publication_versions(restaurant_id,version_number DESC);
CREATE INDEX IF NOT EXISTS menu_publication_versions_schedule_idx ON public.menu_publication_versions(status,scheduled_for) WHERE status='scheduled';
ALTER TABLE public.menu_publication_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS menu_publication_versions_select ON public.menu_publication_versions;
CREATE POLICY menu_publication_versions_select ON public.menu_publication_versions FOR SELECT TO authenticated
USING (app.has_capability(restaurant_id,'manage_menu') OR app.has_capability(restaurant_id,'manage_restaurant'));
DROP POLICY IF EXISTS menu_publication_versions_write ON public.menu_publication_versions;
CREATE POLICY menu_publication_versions_write ON public.menu_publication_versions FOR ALL TO authenticated
USING (app.has_capability(restaurant_id,'manage_menu') OR app.has_capability(restaurant_id,'manage_restaurant'))
WITH CHECK (app.has_capability(restaurant_id,'manage_menu') OR app.has_capability(restaurant_id,'manage_restaurant'));
REVOKE ALL ON public.menu_publication_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.menu_publication_versions TO authenticated;
GRANT ALL ON public.menu_publication_versions TO service_role;

CREATE OR REPLACE FUNCTION public.next_menu_version(_restaurant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT COALESCE(max(version_number),0)+1
  FROM public.menu_publication_versions
  WHERE restaurant_id=_restaurant_id;
$$;
REVOKE ALL ON FUNCTION public.next_menu_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_menu_version(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
