-- Enforce QuickServe's three-level hierarchy in the database:
-- platform owner -> restaurant admin -> operational member.

CREATE OR REPLACE FUNCTION app.can_manage_restaurant(_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.is_super_admin() OR EXISTS (
    SELECT 1
      FROM public.staff s
     WHERE s.auth_user_id = (SELECT auth.uid())
       AND s.is_active
       AND s.restaurant_id = _restaurant_id
       AND s.role = 'restaurant_admin'
  );
$$;

-- Members may see only themselves. Restaurant admins can manage their own
-- roster and the platform owner can manage every tenant.
DROP POLICY IF EXISTS "staff_read_self_or_team" ON public.staff;
CREATE POLICY "staff_read_self_or_admin_team"
  ON public.staff FOR SELECT TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR (restaurant_id IS NOT NULL AND (SELECT app.can_manage_restaurant(restaurant_id)))
  );

-- Restrict operational writes to the task associated with each member role.
CREATE OR REPLACE FUNCTION app.enforce_member_order_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _role public.app_role;
  _changed text[];
BEGIN
  IF (SELECT auth.uid()) IS NULL OR app.is_super_admin() THEN RETURN NEW; END IF;

  SELECT s.role INTO _role
    FROM public.staff s
   WHERE s.auth_user_id = (SELECT auth.uid())
     AND s.restaurant_id = OLD.restaurant_id
     AND s.is_active
   ORDER BY CASE s.role WHEN 'restaurant_admin' THEN 0 ELSE 1 END
   LIMIT 1;

  IF _role = 'restaurant_admin' THEN RETURN NEW; END IF;

  SELECT COALESCE(array_agg(n.key), ARRAY[]::text[]) INTO _changed
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
   WHERE n.value IS DISTINCT FROM o.value;

  IF _role IN ('manager', 'kitchen') AND _changed <@ ARRAY['status','assigned_staff_id','assigned_at','updated_at'] THEN
    RETURN NEW;
  END IF;
  IF _role = 'waiter' AND _changed <@ ARRAY['status','updated_at'] THEN
    RETURN NEW;
  END IF;
  IF _role = 'cashier' AND _changed <@ ARRAY['payment_status','status','updated_at'] THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This role cannot change those order fields' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_member_order_scope ON public.orders;
CREATE TRIGGER trg_enforce_member_order_scope
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app.enforce_member_order_scope();

REVOKE ALL ON FUNCTION app.enforce_member_order_scope() FROM PUBLIC, anon, authenticated;

-- Waiter calls belong to floor staff, restaurant admins and the platform owner.
DROP POLICY IF EXISTS "staff_update_waiter_calls" ON public.waiter_calls;
CREATE POLICY "floor_staff_update_waiter_calls"
  ON public.waiter_calls FOR UPDATE TO authenticated
  USING ((SELECT app.has_restaurant_role(restaurant_id, ARRAY['restaurant_admin','manager','waiter']::public.app_role[])))
  WITH CHECK ((SELECT app.has_restaurant_role(restaurant_id, ARRAY['restaurant_admin','manager','waiter']::public.app_role[])));

NOTIFY pgrst, 'reload schema';
