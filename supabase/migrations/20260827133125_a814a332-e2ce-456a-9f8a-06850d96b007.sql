ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS seat_limit integer;

UPDATE public.restaurants r
   SET seat_limit = CASE r.subscription_plan
                      WHEN 'free' THEN 3
                      WHEN 'basic' THEN 3
                      WHEN 'professional' THEN 10
                      ELSE NULL
                    END
 WHERE r.seat_limit IS NULL AND r.subscription_plan <> 'enterprise';

-- Effective seat limit for a workspace: explicit override, else the plan's max_staff.
CREATE OR REPLACE FUNCTION public.restaurant_seat_limit(_restaurant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(r.seat_limit, p.max_staff)
    FROM public.restaurants r
    LEFT JOIN public.subscription_plans p ON p.plan = r.subscription_plan
   WHERE r.id = _restaurant_id
$$;

CREATE OR REPLACE FUNCTION public.restaurant_seats_used(_restaurant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer FROM public.staff s
   WHERE s.restaurant_id = _restaurant_id AND s.is_active
$$;

-- Only the platform owner may change a workspace's seat limit.
CREATE OR REPLACE FUNCTION public.guard_seat_limit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $$
BEGIN
  IF NEW.seat_limit IS DISTINCT FROM OLD.seat_limit AND NOT app.is_super_admin() THEN
    RAISE EXCEPTION 'only the platform owner can change the seat limit' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restaurants_seat_guard ON public.restaurants;
CREATE TRIGGER trg_restaurants_seat_guard
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.guard_seat_limit_change();

-- Server-side seat enforcement on staff creation / reactivation.
CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _limit integer;
  _used integer;
BEGIN
  IF NEW.restaurant_id IS NULL OR NOT NEW.is_active THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active AND OLD.restaurant_id = NEW.restaurant_id THEN
    RETURN NEW;
  END IF;

  _limit := public.restaurant_seat_limit(NEW.restaurant_id);
  IF _limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer INTO _used
    FROM public.staff s
   WHERE s.restaurant_id = NEW.restaurant_id AND s.is_active AND s.id <> NEW.id;

  IF _used >= _limit THEN
    RAISE EXCEPTION 'seat limit reached (% of % seats used) — upgrade your plan to add more staff', _used, _limit
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_seat_limit ON public.staff;
CREATE TRIGGER trg_staff_seat_limit
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();