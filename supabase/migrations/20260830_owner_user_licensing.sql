-- Owner-controlled per-restaurant user licensing.
-- The existing subscription_plan is the license tier; user_limit is the
-- per-environment seat/license ceiling controlled by the platform Owner.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS user_limit integer NOT NULL DEFAULT 5;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_user_limit_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_user_limit_check CHECK (user_limit > 0 AND user_limit <= 10000);

-- Only the platform Owner may change a restaurant's license tier and seat limit.
CREATE OR REPLACE FUNCTION public.set_restaurant_license(
  p_restaurant_id uuid,
  p_user_limit integer,
  p_license public.subscription_plan
)
RETURNS public.restaurants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant public.restaurants;
  v_active_users integer;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'only the platform owner can manage restaurant licenses' USING ERRCODE = '42501';
  END IF;

  IF p_user_limit IS NULL OR p_user_limit < 1 OR p_user_limit > 10000 THEN
    RAISE EXCEPTION 'user limit must be between 1 and 10000' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_active_users
    FROM public.staff s
   WHERE s.restaurant_id = p_restaurant_id
     AND s.is_active;

  IF p_user_limit < v_active_users THEN
    RAISE EXCEPTION 'user limit cannot be lower than the current active user count (% users)' , v_active_users
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.restaurants
     SET user_limit = p_user_limit,
         subscription_plan = p_license,
         updated_at = now()
   WHERE id = p_restaurant_id
   RETURNING * INTO v_restaurant;

  IF v_restaurant.id IS NULL THEN
    RAISE EXCEPTION 'restaurant not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (restaurant_id, actor_user_id, actor_name, action, entity, entity_id, metadata)
  VALUES (
    p_restaurant_id,
    auth.uid(),
    'Platform Owner',
    'restaurant.license.updated',
    'restaurants',
    p_restaurant_id,
    jsonb_build_object('user_limit', p_user_limit, 'subscription_plan', p_license)
  );

  RETURN v_restaurant;
END;
$$;

REVOKE ALL ON FUNCTION public.set_restaurant_license(uuid, integer, public.subscription_plan) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_restaurant_license(uuid, integer, public.subscription_plan) TO authenticated;

-- Hard database guard: active staff can never exceed the Owner-assigned limit,
-- even if a client bypasses the UI.
CREATE OR REPLACE FUNCTION public.enforce_restaurant_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.restaurant_id IS NULL OR NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Serialize seat allocation per restaurant to avoid concurrent inserts
  -- exceeding the limit.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.restaurant_id::text));

  SELECT user_limit INTO v_limit
    FROM public.restaurants
   WHERE id = NEW.restaurant_id
   FOR UPDATE;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'restaurant license not found' USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_count
    FROM public.staff s
   WHERE s.restaurant_id = NEW.restaurant_id
     AND s.is_active
     AND s.id <> NEW.id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'restaurant user limit reached (% active users)' , v_limit
      USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_restaurant_user_limit ON public.staff;
CREATE TRIGGER trg_enforce_restaurant_user_limit
BEFORE INSERT OR UPDATE OF restaurant_id, is_active ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.enforce_restaurant_user_limit();
