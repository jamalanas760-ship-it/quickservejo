-- No Auth users or credentials are created. All synthetic memberships roll back.
BEGIN;
INSERT INTO public.restaurants(id,name,slug,seat_limit) VALUES
('e10501c9-0f93-44ab-bbbb-71d457a60401','Role test A','transactional-role-test-a',4),
('e10501c9-0f93-44ab-bbbb-71d457a60402','Role test B','transactional-role-test-b',4);
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub',(SELECT auth_user_id::text FROM public.staff WHERE role='super_admin' AND is_active LIMIT 1),true);
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Existing platform owner required'; END IF;
END $$;
SET LOCAL ROLE authenticated;
INSERT INTO public.staff(id,restaurant_id,auth_user_id,name,role,is_active) VALUES
('8801fbc5-47fb-4319-9c84-e065882a0001','e10501c9-0f93-44ab-bbbb-71d457a60401','87d26e20-bcb4-4d87-b32a-b0ae88b80001','Admin A','restaurant_admin',true),
('8801fbc5-47fb-4319-9c84-e065882a0002','e10501c9-0f93-44ab-bbbb-71d457a60401','87d26e20-bcb4-4d87-b32a-b0ae88b80002','Manager A','manager',true),
('8801fbc5-47fb-4319-9c84-e065882a0003','e10501c9-0f93-44ab-bbbb-71d457a60401','87d26e20-bcb4-4d87-b32a-b0ae88b80003','Staff A','waiter',true),
('8801fbc5-47fb-4319-9c84-e065882a0004','e10501c9-0f93-44ab-bbbb-71d457a60402','87d26e20-bcb4-4d87-b32a-b0ae88b80004','Admin B','restaurant_admin',true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','87d26e20-bcb4-4d87-b32a-b0ae88b80001',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.staff(restaurant_id,auth_user_id,name,role,is_active) VALUES
('e10501c9-0f93-44ab-bbbb-71d457a60401','87d26e20-bcb4-4d87-b32a-b0ae88b80005','Admin-created staff','kitchen',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.staff WHERE restaurant_id='e10501c9-0f93-44ab-bbbb-71d457a60402') THEN RAISE EXCEPTION 'Cross-restaurant visibility'; END IF;
  BEGIN
    INSERT INTO public.staff(restaurant_id,auth_user_id,name,role,is_active) VALUES('e10501c9-0f93-44ab-bbbb-71d457a60401','87d26e20-bcb4-4d87-b32a-b0ae88b80006','Over limit','waiter',true);
    RAISE EXCEPTION 'Seat limit not enforced';
  EXCEPTION WHEN SQLSTATE '54000' THEN NULL; END;
  BEGIN
    UPDATE public.staff SET role='restaurant_admin' WHERE id='8801fbc5-47fb-4319-9c84-e065882a0002';
    RAISE EXCEPTION 'Admin promotion accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.staff SET auth_user_id='87d26e20-bcb4-4d87-b32a-b0ae88b80004' WHERE id='8801fbc5-47fb-4319-9c84-e065882a0003';
    RAISE EXCEPTION 'Identity reassignment accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.restaurants SET seat_limit=100 WHERE id='e10501c9-0f93-44ab-bbbb-71d457a60401';
    RAISE EXCEPTION 'Admin changed user limit';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','87d26e20-bcb4-4d87-b32a-b0ae88b80002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.staff(restaurant_id,auth_user_id,name,role,is_active) VALUES('e10501c9-0f93-44ab-bbbb-71d457a60402','87d26e20-bcb4-4d87-b32a-b0ae88b80007','Unauthorized manager insert','waiter',false);
    RAISE EXCEPTION 'Manager created user';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.staff) <> 1 THEN RAISE EXCEPTION 'Manager can read other identities'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','87d26e20-bcb4-4d87-b32a-b0ae88b80003',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  UPDATE public.staff SET role='manager' WHERE id='8801fbc5-47fb-4319-9c84-e065882a0003';
  IF FOUND THEN RAISE EXCEPTION 'Staff promoted itself'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS: Super Admin creates Admin/Manager/Staff; Admin adds Staff within limits; promotion, identity reassignment, limit editing, cross-tenant reads and member writes denied' AS result;
ROLLBACK;
