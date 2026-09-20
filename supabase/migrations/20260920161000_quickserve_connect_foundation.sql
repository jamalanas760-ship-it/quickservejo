-- QuickServe Connect foundation.
-- Stores provider selection and non-secret configuration only. Provider secrets remain server-side.
BEGIN;

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('payments','messaging','delivery','accounting','printers','webhooks','bi')),
  provider text NOT NULL CHECK (length(trim(provider)) BETWEEN 1 AND 80),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','configured','healthy','degraded','error','disabled')),
  credential_ref text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities text[] NOT NULL DEFAULT '{}'::text[],
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, category, provider)
);

CREATE INDEX IF NOT EXISTS integration_connections_restaurant_idx
  ON public.integration_connections(restaurant_id, category, status);

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_connections_select ON public.integration_connections;
CREATE POLICY integration_connections_select
ON public.integration_connections
FOR SELECT TO authenticated
USING (
  app.has_capability(restaurant_id,'manage_restaurant')
  OR app.has_capability(restaurant_id,'view_analytics')
);
DROP POLICY IF EXISTS integration_connections_manage ON public.integration_connections;
CREATE POLICY integration_connections_manage
ON public.integration_connections
FOR ALL TO authenticated
USING (app.has_capability(restaurant_id,'manage_restaurant'))
WITH CHECK (app.has_capability(restaurant_id,'manage_restaurant'));

REVOKE ALL ON public.integration_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;

DROP TRIGGER IF EXISTS trg_integration_connections_updated ON public.integration_connections;
CREATE TRIGGER trg_integration_connections_updated
BEFORE UPDATE ON public.integration_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.integration_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','error')),
  message text NOT NULL CHECK (length(message) <= 1000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_event_log_restaurant_idx
  ON public.integration_event_log(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_event_log_connection_idx
  ON public.integration_event_log(connection_id, created_at DESC)
  WHERE connection_id IS NOT NULL;

ALTER TABLE public.integration_event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_event_log_select ON public.integration_event_log;
CREATE POLICY integration_event_log_select
ON public.integration_event_log
FOR SELECT TO authenticated
USING (
  app.has_capability(restaurant_id,'manage_restaurant')
  OR app.has_capability(restaurant_id,'view_analytics')
);

REVOKE ALL ON public.integration_event_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.integration_event_log TO authenticated;
GRANT ALL ON public.integration_event_log TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
