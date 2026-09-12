-- Transactional verification: creates no users and leaves no records behind.
BEGIN;
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT auth_user_id INTO owner_id FROM public.staff WHERE role='super_admin' AND is_active LIMIT 1;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Test requires an existing platform owner'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
END $$;
SET LOCAL ROLE authenticated;
INSERT INTO public.erp_inventory(id,restaurant_id,name,unit,reorder_level)
VALUES('bfe60a01-78a6-48a1-a9c8-e0310edf4991','6322e1bd-ddac-41f1-9017-703185462ace','Transactional stock test','kg',2);
INSERT INTO public.erp_stock_movements(restaurant_id,item_id,quantity,reason)
VALUES('6322e1bd-ddac-41f1-9017-703185462ace','bfe60a01-78a6-48a1-a9c8-e0310edf4991',5,'Transactional receipt test');
DO $$
BEGIN
  IF (SELECT quantity FROM public.erp_inventory_balances WHERE id='bfe60a01-78a6-48a1-a9c8-e0310edf4991') <> 5 THEN RAISE EXCEPTION 'Incorrect inventory balance'; END IF;
  BEGIN
    INSERT INTO public.erp_stock_movements(restaurant_id,item_id,quantity,reason)
    VALUES('6322e1bd-ddac-41f1-9017-703185462ace','bfe60a01-78a6-48a1-a9c8-e0310edf4991',-6,'Invalid stock test');
    RAISE EXCEPTION 'Negative stock was incorrectly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Insufficient stock' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','184642ce-0421-428a-bf9a-2ed5ec8e04a5',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.erp_inventory_balances) THEN RAISE EXCEPTION 'Unrelated account can read inventory'; END IF;
  BEGIN
    INSERT INTO public.erp_inventory(restaurant_id,name,unit) VALUES('6322e1bd-ddac-41f1-9017-703185462ace','Unauthorized test','pcs');
    RAISE EXCEPTION 'Unrelated account can insert inventory';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.erp_inventory;
    RAISE EXCEPTION 'Anonymous access was incorrectly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'PASS: owner receipt, calculated balance, negative-stock rejection, unrelated-user read/write denial, anonymous denial' AS result;
ROLLBACK;
