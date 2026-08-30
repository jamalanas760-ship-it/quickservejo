-- Fix restaurant licensing to use the existing seat_limit system.
-- The previous owner-user licensing attempt introduced a second, conflicting
-- user_limit path. Remove it and keep seat_limit as the single source of truth.

DROP TRIGGER IF EXISTS trg_enforce_restaurant_user_limit ON public.staff;
DROP FUNCTION IF EXISTS public.enforce_restaurant_user_limit();
DROP FUNCTION IF EXISTS public.set_restaurant_license(uuid, integer, public.subscription_plan);

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_user_limit_check;
ALTER TABLE public.restaurants
  DROP COLUMN IF EXISTS user_limit;

-- Keep the existing owner-only seat guard, but also prevent the Owner from
-- assigning fewer seats than are currently in use.
CREATE OR REPLACE FUNCTION public.guard_seat_limit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $$
DECLARE
  _used integer;
BEGIN
  IF NEW.seat_limit IS DISTINCT FROM OLD.seat_limit THEN
    IF NOT app.is_super_admin() THEN
      RAISE EXCEPTION 'only the platform owner can change the seat limit' USING ERRCODE = '42501';
    END IF;

    IF NEW.seat_limit IS NOT NULL THEN
      SELECT count(*)::integer INTO _used
        FROM public.staff s
       WHERE s.restaurant_id = NEW.id
         AND s.is_active;

      IF NEW.seat_limit < _used THEN
        RAISE EXCEPTION 'seat limit cannot be lower than the current active users (%)', _used
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restaurants_seat_guard ON public.restaurants;
CREATE TRIGGER trg_restaurants_seat_guard
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.guard_seat_limit_change();

REVOKE ALL ON FUNCTION public.guard_seat_limit_change() FROM PUBLIC, anon, authenticated;
