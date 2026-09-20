-- QuickServe commercial hardening wave 1:
-- enforced KDS transitions, stage timestamps, kitchen stations and printer configuration.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS preparing_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS served_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_restaurant_status_created_idx
  ON public.orders(restaurant_id, status, created_at);

CREATE OR REPLACE FUNCTION app.stamp_order_stage_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN
    NEW.accepted_at := now();
  ELSIF NEW.status = 'preparing' AND NEW.preparing_at IS NULL THEN
    NEW.preparing_at := now();
  ELSIF NEW.status = 'ready' AND NEW.ready_at IS NULL THEN
    NEW.ready_at := now();
  ELSIF NEW.status = 'served' AND NEW.served_at IS NULL THEN
    NEW.served_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_order_stage_timestamps ON public.orders;
CREATE TRIGGER trg_stamp_order_stage_timestamps
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION app.stamp_order_stage_timestamps();

-- Backfill timestamps from append-only event history when available.
UPDATE public.orders o
SET
  accepted_at = COALESCE(o.accepted_at, e.accepted_at),
  preparing_at = COALESCE(o.preparing_at, e.preparing_at),
  ready_at = COALESCE(o.ready_at, e.ready_at),
  served_at = COALESCE(o.served_at, e.served_at)
FROM (
  SELECT
    order_id,
    min(created_at) FILTER (WHERE to_status = 'accepted') AS accepted_at,
    min(created_at) FILTER (WHERE to_status = 'preparing') AS preparing_at,
    min(created_at) FILTER (WHERE to_status = 'ready') AS ready_at,
    min(created_at) FILTER (WHERE to_status = 'served') AS served_at
  FROM public.order_status_events
  GROUP BY order_id
) e
WHERE e.order_id = o.id;

CREATE OR REPLACE FUNCTION public.transition_order_status(
  _order_id uuid,
  _next public.order_status,
  _note text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _order public.orders%rowtype;
  _allowed boolean := false;
BEGIN
  SELECT * INTO _order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT (
    app.has_capability(_order.restaurant_id, 'manage_orders')
    OR app.has_capability(_order.restaurant_id, 'manage_restaurant')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _allowed := CASE
    WHEN _order.status = 'new' AND _next = 'accepted' THEN true
    WHEN _order.status = 'accepted' AND _next = 'preparing' THEN true
    WHEN _order.status = 'preparing' AND _next = 'ready' THEN true
    WHEN _order.status = 'ready' AND _next = 'served' THEN true
    ELSE false
  END;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', _order.status, _next;
  END IF;

  UPDATE public.orders
  SET status = _next,
      updated_at = now()
  WHERE id = _order_id
  RETURNING * INTO _order;

  IF NULLIF(trim(COALESCE(_note, '')), '') IS NOT NULL THEN
    UPDATE public.order_status_events
    SET note = trim(_note)
    WHERE id = (
      SELECT id
      FROM public.order_status_events
      WHERE order_id = _order_id AND to_status = _next
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order_status(uuid, public.order_status, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, public.order_status, text)
  TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.kitchen_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  name_ar text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS kitchen_station_id uuid REFERENCES public.kitchen_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS kitchen_stations_restaurant_idx
  ON public.kitchen_stations(restaurant_id, display_order, name);
CREATE INDEX IF NOT EXISTS menu_items_kitchen_station_idx
  ON public.menu_items(restaurant_id, kitchen_station_id)
  WHERE kitchen_station_id IS NOT NULL;

ALTER TABLE public.kitchen_stations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kitchen_stations_read ON public.kitchen_stations;
CREATE POLICY kitchen_stations_read
ON public.kitchen_stations
FOR SELECT TO authenticated
USING (
  app.has_capability(restaurant_id, 'view_orders')
  OR app.has_capability(restaurant_id, 'manage_orders')
  OR app.has_capability(restaurant_id, 'manage_restaurant')
);
DROP POLICY IF EXISTS kitchen_stations_manage ON public.kitchen_stations;
CREATE POLICY kitchen_stations_manage
ON public.kitchen_stations
FOR ALL TO authenticated
USING (app.has_capability(restaurant_id, 'manage_restaurant'))
WITH CHECK (app.has_capability(restaurant_id, 'manage_restaurant'));

REVOKE ALL ON public.kitchen_stations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kitchen_stations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kitchen_stations TO authenticated;
GRANT ALL ON public.kitchen_stations TO service_role;

CREATE TABLE IF NOT EXISTS public.kitchen_printers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  kitchen_station_id uuid REFERENCES public.kitchen_stations(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  purpose text NOT NULL DEFAULT 'kitchen' CHECK (purpose IN ('kitchen','cashier','receipt')),
  provider text NOT NULL DEFAULT 'browser' CHECK (provider IN ('browser','network_adapter','cloud_adapter')),
  endpoint text,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kitchen_printers_restaurant_idx
  ON public.kitchen_printers(restaurant_id, purpose);
CREATE INDEX IF NOT EXISTS kitchen_printers_station_idx
  ON public.kitchen_printers(kitchen_station_id)
  WHERE kitchen_station_id IS NOT NULL;

ALTER TABLE public.kitchen_printers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kitchen_printers_read ON public.kitchen_printers;
CREATE POLICY kitchen_printers_read
ON public.kitchen_printers
FOR SELECT TO authenticated
USING (
  app.has_capability(restaurant_id, 'view_orders')
  OR app.has_capability(restaurant_id, 'manage_orders')
  OR app.has_capability(restaurant_id, 'manage_restaurant')
);
DROP POLICY IF EXISTS kitchen_printers_manage ON public.kitchen_printers;
CREATE POLICY kitchen_printers_manage
ON public.kitchen_printers
FOR ALL TO authenticated
USING (app.has_capability(restaurant_id, 'manage_restaurant'))
WITH CHECK (app.has_capability(restaurant_id, 'manage_restaurant'));

REVOKE ALL ON public.kitchen_printers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kitchen_printers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kitchen_printers TO authenticated;
GRANT ALL ON public.kitchen_printers TO service_role;

DROP TRIGGER IF EXISTS trg_kitchen_stations_updated ON public.kitchen_stations;
CREATE TRIGGER trg_kitchen_stations_updated
BEFORE UPDATE ON public.kitchen_stations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_kitchen_printers_updated ON public.kitchen_printers;
CREATE TRIGGER trg_kitchen_printers_updated
BEFORE UPDATE ON public.kitchen_printers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
COMMIT;
