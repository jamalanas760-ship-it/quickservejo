-- Production-safe, idempotent PDF menu schema repair.
-- QuickServe authorization helpers live in the app schema, not public.

-- The shared guest loader selects menu_theme even for the PDF QR route.
-- Restore its original default when the connected project's base schema is older.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS menu_theme jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.menu_pdf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  page_count integer NOT NULL DEFAULT 0,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  file_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_pdf_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.menu_pdf_documents(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  x numeric(8,6) NOT NULL,
  y numeric(8,6) NOT NULL,
  width numeric(8,6) NOT NULL,
  height numeric(8,6) NOT NULL,
  label text,
  source text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  candidate_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdf_link_box_valid CHECK (x >= 0 AND y >= 0 AND width > 0 AND height > 0 AND x + width <= 1.001 AND y + height <= 1.001)
);

ALTER TABLE public.menu_pdf_documents ADD COLUMN IF NOT EXISTS file_parts jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_pdf_item_links ADD COLUMN IF NOT EXISTS candidate_id text;

CREATE INDEX IF NOT EXISTS idx_pdf_documents_restaurant ON public.menu_pdf_documents(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_pdf_links_document ON public.menu_pdf_item_links(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_pdf_links_item ON public.menu_pdf_item_links(menu_item_id);
-- PdfMenuManagerV2 upserts with onConflict: "document_id,candidate_id".
-- A non-unique index cannot satisfy that conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_links_document_candidate_unique
  ON public.menu_pdf_item_links(document_id, candidate_id);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pdf_documents_updated' AND tgrelid = 'public.menu_pdf_documents'::regclass) THEN
      CREATE TRIGGER trg_pdf_documents_updated BEFORE UPDATE ON public.menu_pdf_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pdf_links_updated' AND tgrelid = 'public.menu_pdf_item_links'::regclass) THEN
      CREATE TRIGGER trg_pdf_links_updated BEFORE UPDATE ON public.menu_pdf_item_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

ALTER TABLE public.menu_pdf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_pdf_item_links ENABLE ROW LEVEL SECURITY;

-- Replace inherited default grants, which may include TRUNCATE (bypasses RLS).
REVOKE ALL ON public.menu_pdf_documents, public.menu_pdf_item_links FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.menu_pdf_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_documents TO authenticated;
GRANT ALL ON public.menu_pdf_documents TO service_role;
GRANT SELECT ON public.menu_pdf_item_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_pdf_item_links TO authenticated;
GRANT ALL ON public.menu_pdf_item_links TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_documents' AND policyname='public_read_active_pdf_document') THEN
    CREATE POLICY public_read_active_pdf_document ON public.menu_pdf_documents FOR SELECT TO anon USING (is_active AND app.is_restaurant_public(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_documents' AND policyname='staff_read_pdf_document') THEN
    CREATE POLICY staff_read_pdf_document ON public.menu_pdf_documents FOR SELECT TO authenticated USING (app.has_restaurant_access(restaurant_id) OR (is_active AND app.is_restaurant_public(restaurant_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_documents' AND policyname='admins_write_pdf_document') THEN
    CREATE POLICY admins_write_pdf_document ON public.menu_pdf_documents FOR ALL TO authenticated USING (app.can_manage_restaurant(restaurant_id)) WITH CHECK (app.can_manage_restaurant(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_item_links' AND policyname='public_read_active_pdf_links') THEN
    CREATE POLICY public_read_active_pdf_links ON public.menu_pdf_item_links FOR SELECT TO anon USING (is_active AND app.is_restaurant_public(restaurant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_item_links' AND policyname='staff_read_pdf_links') THEN
    CREATE POLICY staff_read_pdf_links ON public.menu_pdf_item_links FOR SELECT TO authenticated USING (app.has_restaurant_access(restaurant_id) OR (is_active AND app.is_restaurant_public(restaurant_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_pdf_item_links' AND policyname='admins_write_pdf_links') THEN
    CREATE POLICY admins_write_pdf_links ON public.menu_pdf_item_links
      FOR ALL TO authenticated
      USING (app.can_manage_restaurant(restaurant_id))
      WITH CHECK (
        app.can_manage_restaurant(restaurant_id)
        AND EXISTS (
          SELECT 1 FROM public.menu_pdf_documents document
          WHERE document.id = menu_pdf_item_links.document_id
            AND document.restaurant_id = menu_pdf_item_links.restaurant_id
        )
        AND EXISTS (
          SELECT 1 FROM public.menu_items item
          WHERE item.id = menu_pdf_item_links.menu_item_id
            AND item.restaurant_id = menu_pdf_item_links.restaurant_id
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';


-- Restore the guest checkout/receipt APIs missing from the linked database.
CREATE OR REPLACE FUNCTION app.place_public_order(_qr_token text, _items jsonb, _notes text DEFAULT NULL)
RETURNS TABLE(order_id uuid, order_number text, public_token text, total numeric, currency text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _tbl public.restaurant_tables;
  _rest public.restaurants;
  _settings public.restaurant_settings;
  _oid uuid;
  _num text;
  _token text := replace(gen_random_uuid()::text, '-', '');
  _subtotal numeric := 0;
  _tax numeric := 0;
  _svc numeric := 0;
  _grand numeric := 0;
  _it jsonb;
  _item public.menu_items;
  _qty integer;
  _delta numeric;
  _mods jsonb;
  _unit numeric;
  _prefix text := 'Q' || to_char(now(), 'MMDD') || '-';
  _sequence bigint;
  _modifier_ids jsonb;
  _group public.modifier_groups;
  _selected_count integer;
BEGIN
  IF _qr_token IS NULL OR btrim(_qr_token) = '' THEN
    RAISE EXCEPTION 'invalid table' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _tbl FROM public.restaurant_tables t WHERE t.qr_token = btrim(_qr_token) AND t.is_active;
  IF _tbl.id IS NULL THEN
    RAISE EXCEPTION 'table not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _rest FROM public.restaurants r WHERE r.id = _tbl.restaurant_id AND r.is_active AND r.archived_at IS NULL;
  IF _rest.id IS NULL THEN
    RAISE EXCEPTION 'restaurant unavailable' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _settings FROM public.restaurant_settings s WHERE s.restaurant_id = _rest.id;
  IF _settings.id IS NOT NULL AND NOT _settings.enable_orders THEN
    RAISE EXCEPTION 'ordering disabled' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'empty cart' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty cart' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'too many items' USING ERRCODE = '22023';
  END IF;

  -- Serialize numbering per restaurant without blocking unrelated tenants.
  -- Count-based numbering collided on simultaneous orders and after deletion.
  PERFORM pg_advisory_xact_lock(hashtextextended(_rest.id::text, 0));
  SELECT COALESCE(max(substring(o.order_number from '[0-9]+$')::bigint), 0) + 1
    INTO _sequence FROM public.orders o
    WHERE o.restaurant_id = _rest.id AND o.order_number ~ ('^' || _prefix || '[0-9]+$');
  _num := _prefix || lpad(_sequence::text, greatest(4, length(_sequence::text)), '0');

  INSERT INTO public.orders (
    restaurant_id, table_id, order_number, status, payment_status,
    subtotal, tax_amount, service_amount, discount_amount, total,
    currency, customer_notes, public_token
  ) VALUES (
    _rest.id, _tbl.id, _num, 'new', 'unpaid',
    0, 0, 0, 0, 0,
    _rest.currency, NULLIF(btrim(COALESCE(_notes, '')), ''), _token
  ) RETURNING id INTO _oid;

  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _item
      FROM public.menu_items m
     WHERE m.id = (_it->>'menu_item_id')::uuid
       AND m.restaurant_id = _rest.id
       AND m.is_available;
    IF _item.id IS NULL THEN
      RAISE EXCEPTION 'item unavailable' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(_it->'quantity') IS DISTINCT FROM 'number'
       OR (_it->>'quantity')::numeric <> trunc((_it->>'quantity')::numeric)
       OR (_it->>'quantity')::numeric NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;
    _qty := (_it->>'quantity')::integer;
    _modifier_ids := COALESCE(_it->'modifier_ids', '[]'::jsonb);
    IF jsonb_typeof(_modifier_ids) <> 'array' THEN
      RAISE EXCEPTION 'invalid modifiers' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(_modifier_ids) > 100 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(_modifier_ids) AS selected(value)
      WHERE jsonb_typeof(selected.value) <> 'string'
    ) THEN
      RAISE EXCEPTION 'invalid modifiers' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(mo.price_delta), 0),
           COALESCE(jsonb_agg(jsonb_build_object('id', mo.id, 'name_en', mo.name_en, 'name_ar', mo.name_ar, 'price_delta', mo.price_delta)), '[]'::jsonb)
      INTO _delta, _mods
      FROM public.item_modifiers mo
      JOIN public.modifier_groups mg ON mg.id = mo.group_id
        AND mg.menu_item_id = _item.id AND mg.restaurant_id = _rest.id AND mg.is_active
     WHERE mo.menu_item_id = _item.id
       AND mo.restaurant_id = _rest.id
       AND mo.is_active
       AND mo.id::text = ANY (
         SELECT jsonb_array_elements_text(_modifier_ids)
       );

    IF jsonb_array_length(_mods) <> jsonb_array_length(_modifier_ids) THEN
      RAISE EXCEPTION 'invalid modifiers' USING ERRCODE = '22023';
    END IF;
    FOR _group IN SELECT * FROM public.modifier_groups g
      WHERE g.menu_item_id = _item.id AND g.restaurant_id = _rest.id AND g.is_active LOOP
      SELECT count(*) INTO _selected_count FROM public.item_modifiers m
        WHERE m.group_id = _group.id AND m.menu_item_id = _item.id AND m.restaurant_id = _rest.id
          AND m.is_active AND m.id::text IN (SELECT jsonb_array_elements_text(_modifier_ids));
      IF _selected_count < greatest(_group.min_selection, CASE WHEN _group.is_required THEN 1 ELSE 0 END)
         OR _selected_count > _group.max_selection THEN
        RAISE EXCEPTION 'invalid modifier selection' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    _unit := _item.price + COALESCE(_delta, 0);
    _subtotal := _subtotal + (_unit * _qty);

    INSERT INTO public.order_items (
      restaurant_id, order_id, menu_item_id,
      product_name_snapshot_ar, product_name_snapshot_en,
      quantity, unit_price, total_price, notes, selected_modifiers
    ) VALUES (
      _rest.id, _oid, _item.id,
      _item.name_ar, _item.name_en,
      _qty, _unit, _unit * _qty,
      NULLIF(btrim(COALESCE(_it->>'notes', '')), ''), COALESCE(_mods, '[]'::jsonb)
    );
  END LOOP;

  _tax := round(_subtotal * COALESCE(_rest.tax_rate, 0) / 100.0, 2);
  IF COALESCE(_settings.enable_service_charge, false) THEN
    _svc := round(_subtotal * COALESCE(_rest.service_charge, 0) / 100.0, 2);
  END IF;
  _grand := round(_subtotal, 2) + _tax + _svc;

  IF _settings.id IS NOT NULL AND _settings.minimum_order > 0 AND round(_subtotal, 2) < _settings.minimum_order THEN
    RAISE EXCEPTION 'below minimum order' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders o
     SET subtotal = round(_subtotal, 2), tax_amount = _tax, service_amount = _svc, total = _grand
   WHERE o.id = _oid;

  RETURN QUERY SELECT _oid, _num, _token, _grand, _rest.currency;
END;
$$;

REVOKE ALL ON FUNCTION app.place_public_order(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.place_public_order(text, jsonb, text) TO anon, authenticated;

-- Only these QR-validated operations can write guest orders; table RLS stays intact.
CREATE OR REPLACE FUNCTION public.place_public_order(_qr_token text, _items jsonb, _notes text DEFAULT NULL)
RETURNS TABLE(order_id uuid, order_number text, public_token text, total numeric, currency text)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM app.place_public_order(_qr_token, _items, _notes); $$;
REVOKE ALL ON FUNCTION public.place_public_order(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order(text, jsonb, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION app.public_order_receipt(_public_token text)
RETURNS TABLE(order_number text, status public.order_status, payment_status public.payment_status,
  subtotal numeric, tax_amount numeric, service_amount numeric, discount_amount numeric,
  total numeric, currency text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT o.order_number, o.status, o.payment_status, o.subtotal, o.tax_amount,
    o.service_amount, o.discount_amount, o.total, o.currency, o.created_at
  FROM public.orders o WHERE o.public_token = btrim(_public_token) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION app.public_order_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.public_order_receipt(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_order_receipt(_public_token text)
RETURNS TABLE(order_number text, status public.order_status, payment_status public.payment_status,
  subtotal numeric, tax_amount numeric, service_amount numeric, discount_amount numeric,
  total numeric, currency text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM app.public_order_receipt(_public_token); $$;
REVOKE ALL ON FUNCTION public.public_order_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_receipt(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_order_status(_public_token text)
RETURNS TABLE(order_number text, status public.order_status, payment_status public.payment_status,
  total numeric, currency text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT r.order_number, r.status, r.payment_status, r.total, r.currency, r.created_at
  FROM app.public_order_receipt(_public_token) r; $$;
REVOKE ALL ON FUNCTION public.public_order_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_status(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
