-- Restaurant admins may manage members, but only the platform owner may
-- grant, modify, or remove restaurant-admin access. This protects direct API
-- calls in addition to the application server checks.
CREATE OR REPLACE FUNCTION app.guard_admin_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Trusted backend maintenance and the platform owner remain unrestricted.
  IF (SELECT auth.uid()) IS NULL OR app.is_super_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'restaurant_admin' THEN
    RAISE EXCEPTION 'Only the Super Admin can grant Admin access' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.role = 'restaurant_admin' OR NEW.role = 'restaurant_admin') THEN
    RAISE EXCEPTION 'Only the Super Admin can change Admin access' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.role = 'restaurant_admin' THEN
    RAISE EXCEPTION 'Only the Super Admin can remove Admin access' USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_admin_role_changes ON public.staff;
CREATE TRIGGER trg_guard_admin_role_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION app.guard_admin_role_changes();

REVOKE ALL ON FUNCTION app.guard_admin_role_changes() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
