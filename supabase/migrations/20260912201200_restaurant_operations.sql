-- Restaurant operations foundation: tenant-scoped supplies and expense ledger.
BEGIN;
CREATE TABLE public.erp_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  contact text NOT NULL DEFAULT '' CHECK (length(contact) <= 250),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id)
);
CREATE TABLE public.erp_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  unit text NOT NULL CHECK (unit IN ('kg','g','l','ml','pcs','box')),
  reorder_level numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id), UNIQUE (restaurant_id, name)
);
CREATE TABLE public.erp_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  item_id uuid NOT NULL,
  supplier_id uuid,
  quantity numeric(14,3) NOT NULL CHECK (quantity <> 0),
  unit_cost numeric(14,3) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 250),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id, item_id) REFERENCES public.erp_inventory(restaurant_id, id),
  FOREIGN KEY (restaurant_id, supplier_id) REFERENCES public.erp_suppliers(restaurant_id, id)
);
CREATE TABLE public.erp_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 250),
  category text NOT NULL CHECK (category IN ('supplies','rent','utilities','maintenance','other')),
  amount numeric(14,3) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT current_date,
  reference text NOT NULL DEFAULT '' CHECK (length(reference) <= 100),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.erp_suppliers(restaurant_id);
CREATE INDEX ON public.erp_inventory(restaurant_id);
CREATE INDEX ON public.erp_stock_movements(restaurant_id,item_id);
CREATE INDEX ON public.erp_stock_movements(restaurant_id,supplier_id);
CREATE INDEX ON public.erp_stock_movements(created_by);
CREATE INDEX ON public.erp_expenses(restaurant_id,expense_date);
CREATE INDEX ON public.erp_expenses(created_by);

ALTER TABLE public.erp_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_suppliers, public.erp_inventory, public.erp_stock_movements, public.erp_expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.erp_suppliers, public.erp_inventory TO authenticated;
GRANT SELECT, INSERT ON public.erp_stock_movements, public.erp_expenses TO authenticated;
GRANT ALL ON public.erp_suppliers, public.erp_inventory, public.erp_stock_movements, public.erp_expenses TO service_role;
CREATE POLICY tenant_admin ON public.erp_suppliers TO authenticated USING (app.can_manage_restaurant(restaurant_id)) WITH CHECK (app.can_manage_restaurant(restaurant_id));
CREATE POLICY tenant_admin ON public.erp_inventory TO authenticated USING (app.can_manage_restaurant(restaurant_id)) WITH CHECK (app.can_manage_restaurant(restaurant_id));
CREATE POLICY tenant_read ON public.erp_stock_movements FOR SELECT TO authenticated USING (app.can_manage_restaurant(restaurant_id));
CREATE POLICY tenant_insert ON public.erp_stock_movements FOR INSERT TO authenticated WITH CHECK (app.can_manage_restaurant(restaurant_id) AND created_by = (SELECT auth.uid()));
CREATE POLICY tenant_read ON public.erp_expenses FOR SELECT TO authenticated USING (app.can_manage_restaurant(restaurant_id));
CREATE POLICY tenant_insert ON public.erp_expenses FOR INSERT TO authenticated WITH CHECK (app.can_manage_restaurant(restaurant_id) AND created_by = (SELECT auth.uid()));

CREATE FUNCTION app.validate_stock_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE available numeric;
BEGIN
  PERFORM 1 FROM public.erp_inventory WHERE id = NEW.item_id AND restaurant_id = NEW.restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found or access denied'; END IF;
  SELECT COALESCE(sum(quantity),0) INTO available FROM public.erp_stock_movements WHERE item_id=NEW.item_id AND restaurant_id=NEW.restaurant_id;
  IF available + NEW.quantity < 0 THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.validate_stock_movement() FROM PUBLIC;
CREATE TRIGGER validate_stock BEFORE INSERT ON public.erp_stock_movements FOR EACH ROW EXECUTE FUNCTION app.validate_stock_movement();
CREATE VIEW public.erp_inventory_balances WITH (security_invoker=true) AS
  SELECT i.id, i.restaurant_id, i.name, i.unit, i.reorder_level, COALESCE(sum(m.quantity),0) AS quantity
  FROM public.erp_inventory i LEFT JOIN public.erp_stock_movements m ON m.item_id=i.id AND m.restaurant_id=i.restaurant_id
  GROUP BY i.id;
REVOKE ALL ON public.erp_inventory_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.erp_inventory_balances TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
