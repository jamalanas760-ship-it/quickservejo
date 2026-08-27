-- 1. Order status events (append-only worklog)
CREATE TABLE public.order_status_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  actor_user_id uuid,
  actor_name text,
  actor_role public.app_role,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_events_order ON public.order_status_events(order_id, created_at);
CREATE INDEX idx_order_status_events_restaurant ON public.order_status_events(restaurant_id, created_at DESC);

GRANT SELECT, INSERT ON public.order_status_events TO authenticated;
GRANT ALL ON public.order_status_events TO service_role;

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view their restaurant order events"
ON public.order_status_events FOR SELECT TO authenticated
USING (
  public.is_platform_owner()
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active
      AND s.restaurant_id = order_status_events.restaurant_id
  )
);

CREATE POLICY "Staff can add their restaurant order events"
ON public.order_status_events FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_owner()
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active
      AND s.restaurant_id = order_status_events.restaurant_id
  )
);

-- 2. Cancellation + chef assignment on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_note text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_staff ON public.orders(assigned_staff_id);

-- 3. Sold-out control on menu items
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS sold_out_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sold_out_note text;

-- 4. Auto-log status changes
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _role public.app_role;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT s.name, s.role INTO _name, _role
      FROM public.staff s
     WHERE s.auth_user_id = auth.uid()
       AND (s.restaurant_id = NEW.restaurant_id OR s.restaurant_id IS NULL)
     ORDER BY (s.restaurant_id IS NOT NULL) DESC
     LIMIT 1;

    INSERT INTO public.order_status_events (
      restaurant_id, order_id, from_status, to_status, actor_user_id, actor_name, actor_role, note
    ) VALUES (
      NEW.restaurant_id, NEW.id, OLD.status, NEW.status, auth.uid(), _name, _role,
      CASE WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason ELSE NULL END
    );

    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
      NEW.cancelled_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_log ON public.orders;
CREATE TRIGGER trg_orders_status_log
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();