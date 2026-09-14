-- Transactional verification for Back Office purchasing. Leaves no records behind.
BEGIN;
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT auth_user_id INTO owner_id FROM public.staff WHERE role='super_admin' AND is_active LIMIT 1;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Test requires an existing platform owner'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
END $$;
SET LOCAL ROLE authenticated;

-- Fixtures inside the tenant used by the existing operations test.
INSERT INTO public.erp_suppliers(id,restaurant_id,name)
VALUES('11111111-1111-4111-8111-111111111111','6322e1bd-ddac-41f1-9017-703185462ace','Purchasing test supplier');
INSERT INTO public.erp_inventory(id,restaurant_id,name,unit,reorder_level)
VALUES('22222222-2222-4222-8222-222222222222','6322e1bd-ddac-41f1-9017-703185462ace','Purchasing test item','kg',1);
INSERT INTO public.erp_purchase_orders(id,restaurant_id,supplier_id,po_seq,po_number)
VALUES('33333333-3333-4333-8333-333333333333','6322e1bd-ddac-41f1-9017-703185462ace','11111111-1111-4111-8111-111111111111',0,'placeholder');
INSERT INTO public.erp_purchase_order_items(id,restaurant_id,purchase_order_id,item_id,ordered_quantity,unit_cost)
VALUES('44444444-4444-4444-8444-444444444444','6322e1bd-ddac-41f1-9017-703185462ace','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',10,2.5);

DO $$
DECLARE result text; qty numeric;
BEGIN
  -- PO number is assigned by the trigger, not by the client.
  IF (SELECT po_number FROM public.erp_purchase_orders WHERE id='33333333-3333-4333-8333-333333333333') = 'placeholder'
    THEN RAISE EXCEPTION 'PO number was not generated'; END IF;

  -- A draft order is not receivable.
  BEGIN
    PERFORM public.erp_receive_purchase_order('6322e1bd-ddac-41f1-9017-703185462ace','33333333-3333-4333-8333-333333333333','k1',
      '[{"item":"44444444-4444-4444-8444-444444444444","quantity":4}]'::jsonb);
    RAISE EXCEPTION 'Draft purchase order was incorrectly received';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'This purchase order is not ready to receive' THEN RAISE; END IF;
  END;

  -- Invalid transition is refused.
  BEGIN
    UPDATE public.erp_purchase_orders SET status='received' WHERE id='33333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'Invalid transition was incorrectly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Invalid purchase order transition' THEN RAISE; END IF;
  END;

  UPDATE public.erp_purchase_orders SET status='pending_approval' WHERE id='33333333-3333-4333-8333-333333333333';
  UPDATE public.erp_purchase_orders SET status='approved' WHERE id='33333333-3333-4333-8333-333333333333';
  UPDATE public.erp_purchase_orders SET status='ordered' WHERE id='33333333-3333-4333-8333-333333333333';

  -- Lines are locked once the order leaves draft.
  BEGIN
    UPDATE public.erp_purchase_order_items SET ordered_quantity=99 WHERE id='44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'Line edit outside draft was incorrectly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Purchase order lines can only be changed while the order is a draft' THEN RAISE; END IF;
  END;

  -- Partial receipt.
  result := public.erp_receive_purchase_order('6322e1bd-ddac-41f1-9017-703185462ace','33333333-3333-4333-8333-333333333333','k1',
    '[{"item":"44444444-4444-4444-8444-444444444444","quantity":4}]'::jsonb);
  IF result <> 'partially_received' THEN RAISE EXCEPTION 'Expected partially_received, got %', result; END IF;

  -- Duplicate submission of the same receipt key must not double-post stock.
  result := public.erp_receive_purchase_order('6322e1bd-ddac-41f1-9017-703185462ace','33333333-3333-4333-8333-333333333333','k1',
    '[{"item":"44444444-4444-4444-8444-444444444444","quantity":4}]'::jsonb);
  SELECT quantity INTO qty FROM public.erp_inventory_balances WHERE id='22222222-2222-4222-8222-222222222222';
  IF qty <> 4 THEN RAISE EXCEPTION 'Duplicate receipt double-posted stock: %', qty; END IF;

  -- Over-receipt is refused.
  BEGIN
    PERFORM public.erp_receive_purchase_order('6322e1bd-ddac-41f1-9017-703185462ace','33333333-3333-4333-8333-333333333333','k2',
      '[{"item":"44444444-4444-4444-8444-444444444444","quantity":99}]'::jsonb);
    RAISE EXCEPTION 'Over-receipt was incorrectly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Received quantity exceeds the ordered quantity' THEN RAISE; END IF;
  END;

  -- Final receipt closes the order.
  result := public.erp_receive_purchase_order('6322e1bd-ddac-41f1-9017-703185462ace','33333333-3333-4333-8333-333333333333','k3',
    '[{"item":"44444444-4444-4444-8444-444444444444","quantity":6}]'::jsonb);
  IF result <> 'received' THEN RAISE EXCEPTION 'Expected received, got %', result; END IF;
  SELECT quantity INTO qty FROM public.erp_inventory_balances WHERE id='22222222-2222-4222-8222-222222222222';
  IF qty <> 10 THEN RAISE EXCEPTION 'Incorrect balance after final receipt: %', qty; END IF;
END $$;

-- Cancelled orders cannot be received.
INSERT INTO public.erp_purchase_orders(id,restaurant_id,supplier_id,po_seq,po_number,status)
VALUES('55555555-5555-4555-8555-555555555555','6322e1bd-ddac-41f1-9017-703185462ace','11111111-1111-4111-8111-111111111111',0,'placeholder','draft');
INSERT INTO public.erp_purchase_order_items(id,restaurant_id,purchase_order_id,item_id,ordered_quantity,unit_cost)
VALUES('66666666-6666-4666-8666-666666666666','6322e1bd-ddac-41f1-9017-703185462ace','55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',3,1);
UPDATE public.erp_purchase_orders SET status='cancelled' WHERE id='55555555-5555-4555-8555-555555555555';
DO $$
BEGIN
  BEGIN
    PERFORM public.erp_receive_purchase_order('6322e1bd-ddac-41f1-9017-703185462ace','55555555-5555-4555-8555-555555555555','k9',
      '[{"item":"66666666-6666-4666-8666-666666666666","quantity":1}]'::jsonb);
    RAISE EXCEPTION 'Cancelled purchase order was incorrectly received';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'A cancelled purchase order cannot be received' THEN RAISE; END IF;
  END;
END $$;

-- Cross-tenant references are impossible.
DO $$
DECLARE other_restaurant uuid;
BEGIN
  SELECT id INTO other_restaurant FROM public.restaurants
    WHERE id <> '6322e1bd-ddac-41f1-9017-703185462ace' LIMIT 1;
  IF other_restaurant IS NULL THEN RAISE NOTICE 'Skipped cross-tenant FK test: only one restaurant'; RETURN; END IF;
  BEGIN
    INSERT INTO public.erp_purchase_orders(restaurant_id,supplier_id,po_seq,po_number)
    VALUES(other_restaurant,'11111111-1111-4111-8111-111111111111',0,'placeholder');
    RAISE EXCEPTION 'Cross-tenant supplier reference was incorrectly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.erp_purchase_order_items(restaurant_id,purchase_order_id,item_id,ordered_quantity)
    VALUES(other_restaurant,'33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',1);
    RAISE EXCEPTION 'Cross-tenant purchase order line was incorrectly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
RESET ROLE;

-- Unrelated account and anonymous access are denied.
SELECT set_config('request.jwt.claim.sub','184642ce-0421-428a-bf9a-2ed5ec8e04a5',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.erp_purchase_orders) THEN RAISE EXCEPTION 'Unrelated account can read purchase orders'; END IF;
  BEGIN
    PERFORM public.erp_receive_purchase_order('6322e1bd-ddac-41f1-9017-703185462ace','33333333-3333-4333-8333-333333333333','k7',
      '[{"item":"44444444-4444-4444-8444-444444444444","quantity":1}]'::jsonb);
    RAISE EXCEPTION 'Unrelated account can receive stock';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Access denied' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.erp_purchase_orders;
    RAISE EXCEPTION 'Anonymous access was incorrectly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'PASS: PO numbering, transition guards, draft-only lines, partial + final receipt, idempotent receive, over-receipt and cancelled refusal, cross-tenant FK denial, unrelated/anonymous denial' AS result;
ROLLBACK;
