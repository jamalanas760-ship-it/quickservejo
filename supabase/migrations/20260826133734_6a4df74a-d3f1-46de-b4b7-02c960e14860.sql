-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin','restaurant_admin','manager','kitchen','waiter','cashier');
CREATE TYPE public.order_status AS ENUM ('new','accepted','preparing','ready','served','paid','cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid','paid','refunded');
CREATE TYPE public.waiter_call_status AS ENUM ('pending','acknowledged','resolved');
CREATE TYPE public.subscription_plan AS ENUM ('free','basic','professional','enterprise');
CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','cancelled','suspended');

-- ============ SHARED TRIGGER FN ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ RESTAURANTS ============
CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  cover_image_url text,
  description_ar text,
  description_en text,
  phone text,
  email text,
  address_ar text,
  address_en text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  primary_color text NOT NULL DEFAULT 'oklch(0.55 0.18 25)',
  secondary_color text NOT NULL DEFAULT 'oklch(0.35 0.05 25)',
  accent_color text NOT NULL DEFAULT 'oklch(0.78 0.14 85)',
  background_color text NOT NULL DEFAULT 'oklch(1 0 0)',
  text_color text NOT NULL DEFAULT 'oklch(0.15 0.02 260)',
  font_family text NOT NULL DEFAULT 'Plus Jakarta Sans',
  layout_style text NOT NULL DEFAULT 'grid',
  card_style text NOT NULL DEFAULT 'rounded',
  menu_style text NOT NULL DEFAULT 'standard',
  theme text NOT NULL DEFAULT 'light',
  default_language text NOT NULL DEFAULT 'en',
  currency text NOT NULL DEFAULT 'USD',
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  service_charge numeric(6,3) NOT NULL DEFAULT 0,
  timezone text NOT NULL DEFAULT 'UTC',
  is_active boolean NOT NULL DEFAULT true,
  subscription_plan public.subscription_plan NOT NULL DEFAULT 'free',
  subscription_status public.subscription_status NOT NULL DEFAULT 'trialing',
  subscription_start timestamptz NOT NULL DEFAULT now(),
  subscription_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_restaurants_slug ON public.restaurants(slug);
CREATE INDEX idx_restaurants_active ON public.restaurants(is_active);

-- ============ STAFF ============
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  role public.app_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_tenant_scope CHECK (
    (role = 'super_admin' AND restaurant_id IS NULL)
    OR (role <> 'super_admin' AND restaurant_id IS NOT NULL)
  ),
  CONSTRAINT staff_unique_membership UNIQUE (auth_user_id, restaurant_id)
);
CREATE INDEX idx_staff_auth_user ON public.staff(auth_user_id);
CREATE INDEX idx_staff_restaurant ON public.staff(restaurant_id);

-- ============ SECURITY HELPERS ============
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid() AND s.role = 'super_admin' AND s.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.has_restaurant_access(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid() AND s.is_active AND s.restaurant_id = _restaurant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_restaurant_role(_restaurant_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid() AND s.is_active
      AND s.restaurant_id = _restaurant_id AND s.role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_restaurant(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_restaurant_role(_restaurant_id, ARRAY['restaurant_admin','manager']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_public(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = _restaurant_id AND r.is_active);
$$;

-- ============ RESTAURANT SETTINGS ============
CREATE TABLE public.restaurant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enable_orders boolean NOT NULL DEFAULT true,
  enable_waiter_calls boolean NOT NULL DEFAULT true,
  enable_cashier boolean NOT NULL DEFAULT true,
  enable_kitchen_display boolean NOT NULL DEFAULT true,
  enable_reviews boolean NOT NULL DEFAULT false,
  enable_tips boolean NOT NULL DEFAULT false,
  enable_service_charge boolean NOT NULL DEFAULT false,
  show_prices boolean NOT NULL DEFAULT true,
  allow_special_notes boolean NOT NULL DEFAULT true,
  sound_notifications boolean NOT NULL DEFAULT true,
  order_auto_accept boolean NOT NULL DEFAULT false,
  minimum_order numeric(10,2) NOT NULL DEFAULT 0,
  estimated_preparation_time integer NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ TABLES ============
CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_number text NOT NULL,
  table_name text,
  qr_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12),'hex'),
  qr_code_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tables_unique_number UNIQUE (restaurant_id, table_number)
);
CREATE INDEX idx_tables_restaurant ON public.restaurant_tables(restaurant_id);
CREATE INDEX idx_tables_qr_token ON public.restaurant_tables(qr_token);

-- ============ MENU CATEGORIES ============
CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  image_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_restaurant ON public.menu_categories(restaurant_id, display_order);

-- ============ MENU ITEMS ============
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  compare_at_price numeric(10,2),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  preparation_time integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_restaurant ON public.menu_items(restaurant_id, display_order);
CREATE INDEX idx_items_category ON public.menu_items(category_id);

-- ============ MODIFIER GROUPS + MODIFIERS ============
CREATE TABLE public.modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  min_selection integer NOT NULL DEFAULT 0,
  max_selection integer NOT NULL DEFAULT 1,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_modgroups_item ON public.modifier_groups(menu_item_id, display_order);
CREATE INDEX idx_modgroups_restaurant ON public.modifier_groups(restaurant_id);

CREATE TABLE public.item_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  price_delta numeric(10,2) NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_modifiers_group ON public.item_modifiers(group_id, display_order);
CREATE INDEX idx_modifiers_restaurant ON public.item_modifiers(restaurant_id);

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  status public.order_status NOT NULL DEFAULT 'new',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  service_amount numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  customer_notes text,
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12),'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_unique_number UNIQUE (restaurant_id, order_number)
);
CREATE INDEX idx_orders_restaurant_status ON public.orders(restaurant_id, status);
CREATE INDEX idx_orders_created_at ON public.orders(restaurant_id, created_at DESC);
CREATE INDEX idx_orders_table ON public.orders(table_id);
CREATE INDEX idx_orders_public_token ON public.orders(public_token);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  product_name_snapshot_ar text NOT NULL,
  product_name_snapshot_en text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  total_price numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  selected_modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_restaurant ON public.order_items(restaurant_id);

-- ============ WAITER CALLS ============
CREATE TABLE public.waiter_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  status public.waiter_call_status NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
CREATE INDEX idx_waiter_calls_restaurant ON public.waiter_calls(restaurant_id, status, created_at DESC);

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  actor_user_id uuid,
  actor_name text,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_restaurant ON public.audit_logs(restaurant_id, created_at DESC);

-- ============ SUBSCRIPTION PLANS + PLATFORM SETTINGS ============
CREATE TABLE public.subscription_plans (
  plan public.subscription_plan PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  max_tables integer,
  max_products integer,
  max_staff integer,
  max_monthly_orders integer,
  analytics_enabled boolean NOT NULL DEFAULT false,
  custom_branding boolean NOT NULL DEFAULT false,
  ai_features boolean NOT NULL DEFAULT false,
  advanced_features boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true,
  platform_name text NOT NULL DEFAULT 'QuickServe',
  logo_url text,
  default_currency text NOT NULL DEFAULT 'USD',
  default_language text NOT NULL DEFAULT 'en',
  default_theme text NOT NULL DEFAULT 'light',
  default_tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  feature_flags jsonb NOT NULL DEFAULT '{"ai_design":true,"ai_menu":true,"import_export":false}'::jsonb,
  ai_settings jsonb NOT NULL DEFAULT '{"model":"google/gemini-2.5-flash"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton CHECK (id)
);

-- ============ UPDATED_AT TRIGGERS ============
CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.restaurant_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tables_updated BEFORE UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_modgroups_updated BEFORE UPDATE ON public.modifier_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_modifiers_updated BEFORE UPDATE ON public.item_modifiers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_platform_updated BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ GRANTS ============
GRANT SELECT ON public.restaurants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurants TO authenticated;
GRANT ALL ON public.restaurants TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;

GRANT SELECT ON public.restaurant_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_settings TO authenticated;
GRANT ALL ON public.restaurant_settings TO service_role;

GRANT SELECT ON public.restaurant_tables TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;

GRANT SELECT ON public.menu_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT ALL ON public.menu_categories TO service_role;

GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;

GRANT SELECT ON public.modifier_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modifier_groups TO authenticated;
GRANT ALL ON public.modifier_groups TO service_role;

GRANT SELECT ON public.item_modifiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_modifiers TO authenticated;
GRANT ALL ON public.item_modifiers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiter_calls TO authenticated;
GRANT ALL ON public.waiter_calls TO service_role;

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

GRANT SELECT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

-- ============ RLS ============
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- restaurants
CREATE POLICY "public_read_active_restaurants" ON public.restaurants FOR SELECT TO anon USING (is_active);
CREATE POLICY "staff_read_own_restaurant" ON public.restaurants FOR SELECT TO authenticated USING (is_active OR public.has_restaurant_access(id));
CREATE POLICY "admins_update_own_restaurant" ON public.restaurants FOR UPDATE TO authenticated USING (public.can_manage_restaurant(id)) WITH CHECK (public.can_manage_restaurant(id));
CREATE POLICY "super_admin_insert_restaurants" ON public.restaurants FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_delete_restaurants" ON public.restaurants FOR DELETE TO authenticated USING (public.is_super_admin());

-- staff
CREATE POLICY "staff_read_self_or_team" ON public.staff FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (restaurant_id IS NOT NULL AND public.has_restaurant_access(restaurant_id)));
CREATE POLICY "admins_manage_staff_insert" ON public.staff FOR INSERT TO authenticated
  WITH CHECK (role <> 'super_admin' AND restaurant_id IS NOT NULL AND public.can_manage_restaurant(restaurant_id));
CREATE POLICY "admins_manage_staff_update" ON public.staff FOR UPDATE TO authenticated
  USING (restaurant_id IS NOT NULL AND public.can_manage_restaurant(restaurant_id))
  WITH CHECK (role <> 'super_admin' AND restaurant_id IS NOT NULL AND public.can_manage_restaurant(restaurant_id));
CREATE POLICY "admins_manage_staff_delete" ON public.staff FOR DELETE TO authenticated
  USING (restaurant_id IS NOT NULL AND public.can_manage_restaurant(restaurant_id));

-- restaurant_settings
CREATE POLICY "public_read_settings" ON public.restaurant_settings FOR SELECT TO anon USING (public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_settings" ON public.restaurant_settings FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR public.is_restaurant_public(restaurant_id));
CREATE POLICY "admins_write_settings" ON public.restaurant_settings FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

-- restaurant_tables
CREATE POLICY "public_read_tables" ON public.restaurant_tables FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_tables" ON public.restaurant_tables FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
CREATE POLICY "admins_write_tables" ON public.restaurant_tables FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

-- menu_categories
CREATE POLICY "public_read_categories" ON public.menu_categories FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_categories" ON public.menu_categories FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
CREATE POLICY "admins_write_categories" ON public.menu_categories FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

-- menu_items
CREATE POLICY "public_read_items" ON public.menu_items FOR SELECT TO anon USING (public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_items" ON public.menu_items FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR public.is_restaurant_public(restaurant_id));
CREATE POLICY "admins_write_items" ON public.menu_items FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

-- modifier_groups
CREATE POLICY "public_read_modgroups" ON public.modifier_groups FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_modgroups" ON public.modifier_groups FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
CREATE POLICY "admins_write_modgroups" ON public.modifier_groups FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

-- item_modifiers
CREATE POLICY "public_read_modifiers" ON public.item_modifiers FOR SELECT TO anon USING (is_active AND public.is_restaurant_public(restaurant_id));
CREATE POLICY "staff_read_modifiers" ON public.item_modifiers FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id) OR (is_active AND public.is_restaurant_public(restaurant_id)));
CREATE POLICY "admins_write_modifiers" ON public.item_modifiers FOR ALL TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));

-- orders (customers read/write through server functions only; staff scoped by tenant)
CREATE POLICY "staff_read_orders" ON public.orders FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id));
CREATE POLICY "staff_update_orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_restaurant_access(restaurant_id)) WITH CHECK (public.has_restaurant_access(restaurant_id));
CREATE POLICY "admins_insert_orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.has_restaurant_access(restaurant_id));
CREATE POLICY "admins_delete_orders" ON public.orders FOR DELETE TO authenticated USING (public.can_manage_restaurant(restaurant_id));

CREATE POLICY "staff_read_order_items" ON public.order_items FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id));
CREATE POLICY "staff_insert_order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (public.has_restaurant_access(restaurant_id));
CREATE POLICY "admins_write_order_items" ON public.order_items FOR UPDATE TO authenticated USING (public.can_manage_restaurant(restaurant_id)) WITH CHECK (public.can_manage_restaurant(restaurant_id));
CREATE POLICY "admins_delete_order_items" ON public.order_items FOR DELETE TO authenticated USING (public.can_manage_restaurant(restaurant_id));

-- waiter_calls
CREATE POLICY "staff_read_waiter_calls" ON public.waiter_calls FOR SELECT TO authenticated USING (public.has_restaurant_access(restaurant_id));
CREATE POLICY "staff_update_waiter_calls" ON public.waiter_calls FOR UPDATE TO authenticated USING (public.has_restaurant_access(restaurant_id)) WITH CHECK (public.has_restaurant_access(restaurant_id));
CREATE POLICY "staff_insert_waiter_calls" ON public.waiter_calls FOR INSERT TO authenticated WITH CHECK (public.has_restaurant_access(restaurant_id));
CREATE POLICY "admins_delete_waiter_calls" ON public.waiter_calls FOR DELETE TO authenticated USING (public.can_manage_restaurant(restaurant_id));

-- audit_logs
CREATE POLICY "admins_read_audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (restaurant_id IS NOT NULL AND public.can_manage_restaurant(restaurant_id)));
CREATE POLICY "staff_write_audit" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid() AND (restaurant_id IS NULL OR public.has_restaurant_access(restaurant_id)));

-- subscription_plans
CREATE POLICY "authenticated_read_plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin_write_plans" ON public.subscription_plans FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- platform_settings
CREATE POLICY "authenticated_read_platform" ON public.platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin_write_platform" ON public.platform_settings FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ============ REALTIME ============
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.waiter_calls REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiter_calls;

-- ============ PLAN + PLATFORM SEED ============
INSERT INTO public.subscription_plans (plan, name_en, name_ar, price_monthly, max_tables, max_products, max_staff, max_monthly_orders, analytics_enabled, custom_branding, ai_features, advanced_features) VALUES
  ('free','Free','مجاني',0,5,25,2,300,false,false,false,false),
  ('basic','Basic','أساسي',29,15,100,5,2000,true,false,false,false),
  ('professional','Professional','احترافي',79,50,500,20,10000,true,true,true,false),
  ('enterprise','Enterprise','مؤسسات',199,NULL,NULL,NULL,NULL,true,true,true,true);

INSERT INTO public.platform_settings (id) VALUES (true);