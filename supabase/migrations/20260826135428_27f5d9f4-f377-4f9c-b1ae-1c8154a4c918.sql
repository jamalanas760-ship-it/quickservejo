ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_restaurants_archived_at ON public.restaurants (archived_at);

-- Read-only wrapper so the client can ask "am I the platform owner?" without
-- trusting any client-side flag. Authorization itself stays in RLS.
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$ SELECT app.is_super_admin() $$;

GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;

-- One-time bootstrap: the very first signed-in account may claim platform
-- ownership only while no active platform owner exists. Afterwards this is a
-- no-op, so it can never be used for privilege escalation.
CREATE OR REPLACE FUNCTION public.claim_platform_ownership(_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.staff s WHERE s.role = 'super_admin' AND s.is_active) THEN
    RETURN false;
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = _uid;

  INSERT INTO public.staff (restaurant_id, auth_user_id, name, email, role, is_active)
  VALUES (NULL, _uid, COALESCE(NULLIF(_name, ''), split_part(COALESCE(_email, 'Owner'), '@', 1)), _email, 'super_admin', true);

  INSERT INTO public.audit_logs (restaurant_id, actor_user_id, actor_name, action, entity, entity_id, metadata)
  VALUES (NULL, _uid, COALESCE(_name, _email), 'platform.ownership_claimed', 'staff', NULL, '{}'::jsonb);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_platform_ownership(text) TO authenticated;