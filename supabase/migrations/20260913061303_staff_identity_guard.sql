BEGIN;
CREATE OR REPLACE FUNCTION app.guard_staff_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
    RAISE EXCEPTION 'Staff identity and restaurant cannot be reassigned; create a separate membership instead' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_staff_identity() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_guard_staff_identity ON public.staff;
CREATE TRIGGER trg_guard_staff_identity BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION app.guard_staff_identity();
COMMIT;
