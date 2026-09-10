-- Restore the single per-restaurant user limit expected by the application.
-- Super Admin sets the limit; Restaurant Admin may add operational members
-- only while capacity remains. The trigger is the authoritative concurrency-safe gate.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS seat_limit integer;

UPDATE public.restaurants
SET seat_limit = CASE subscription_plan
  WHEN 'professional' THEN 10
  WHEN 'enterprise' THEN 50
  ELSE 3
END
WHERE seat_limit IS NULL;

ALTER TABLE public.restaurants
  ALTER COLUMN seat_limit SET DEFAULT 3,
  ALTER COLUMN seat_limit SET NOT NULL;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_seat_limit_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_seat_limit_check
  CHECK (seat_limit BETWEEN 1 AND 10000);

CREATE OR REPLACE FUNCTION app.enforce_restaurant_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _limit integer;
  _used integer;
BEGIN
  IF NEW.restaurant_id IS NULL OR NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Lock per restaurant so simultaneous invitations cannot exceed capacity.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.restaurant_id::text));

  SELECT r.seat_limit INTO _limit
  FROM public.restaurants r
  WHERE r.id = NEW.restaurant_id
  FOR UPDATE;

  IF _limit IS NULL THEN
    RAISE EXCEPTION 'restaurant user limit is not configured' USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO _used
  FROM public.staff s
  WHERE s.restaurant_id = NEW.restaurant_id
    AND s.is_active
    AND s.id IS DISTINCT FROM NEW.id;

  IF _used >= _limit THEN
    RAISE EXCEPTION 'restaurant user limit reached (% active users)', _limit
      USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_restaurant_seat_limit ON public.staff;
CREATE TRIGGER trg_enforce_restaurant_seat_limit
  BEFORE INSERT OR UPDATE OF restaurant_id, is_active ON public.staff
  FOR EACH ROW EXECUTE FUNCTION app.enforce_restaurant_seat_limit();

CREATE OR REPLACE FUNCTION app.guard_restaurant_seat_limit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _used integer;
BEGIN
  IF NEW.seat_limit IS DISTINCT FROM OLD.seat_limit THEN
    IF NOT app.is_super_admin() THEN
      RAISE EXCEPTION 'only the Super Admin can change the user limit' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer INTO _used
    FROM public.staff s
    WHERE s.restaurant_id = NEW.id AND s.is_active;

    IF NEW.seat_limit < _used THEN
      RAISE EXCEPTION 'user limit cannot be lower than current active users (%)', _used
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restaurants_seat_guard ON public.restaurants;
CREATE TRIGGER trg_restaurants_seat_guard
  BEFORE UPDATE OF seat_limit ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION app.guard_restaurant_seat_limit_change();

REVOKE ALL ON FUNCTION app.enforce_restaurant_seat_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.guard_restaurant_seat_limit_change() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
