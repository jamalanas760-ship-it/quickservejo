CREATE OR REPLACE FUNCTION public.place_public_order(_qr_token text, _items jsonb, _notes text DEFAULT NULL)
RETURNS TABLE(order_id uuid, order_number text, public_token text, total numeric, currency text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
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

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'empty cart' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'too many items' USING ERRCODE = '22023';
  END IF;

  SELECT 'Q' || to_char(now(), 'MMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    INTO _num
    FROM public.orders o
   WHERE o.restaurant_id = _rest.id
     AND o.created_at >= date_trunc('day', now());

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

    _qty := LEAST(GREATEST(COALESCE((_it->>'quantity')::integer, 1), 1), 50);

    SELECT COALESCE(sum(mo.price_delta), 0),
           COALESCE(jsonb_agg(jsonb_build_object('id', mo.id, 'name_en', mo.name_en, 'name_ar', mo.name_ar, 'price_delta', mo.price_delta)), '[]'::jsonb)
      INTO _delta, _mods
      FROM public.item_modifiers mo
     WHERE mo.menu_item_id = _item.id
       AND mo.restaurant_id = _rest.id
       AND mo.is_active
       AND mo.id::text = ANY (
         SELECT jsonb_array_elements_text(COALESCE(_it->'modifier_ids', '[]'::jsonb))
       );

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
  IF _settings.id IS NULL OR _settings.enable_service_charge THEN
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

REVOKE ALL ON FUNCTION public.place_public_order(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order(text, jsonb, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_order_status(_public_token text)
RETURNS TABLE(order_number text, status public.order_status, payment_status public.payment_status, total numeric, currency text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $$
  SELECT o.order_number, o.status, o.payment_status, o.total, o.currency, o.created_at
    FROM public.orders o
   WHERE o.public_token = btrim(_public_token)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_order_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_status(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_call_waiter(_qr_token text, _note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $$
DECLARE
  _tbl public.restaurant_tables;
  _enabled boolean;
BEGIN
  SELECT * INTO _tbl FROM public.restaurant_tables t WHERE t.qr_token = btrim(COALESCE(_qr_token, '')) AND t.is_active;
  IF _tbl.id IS NULL THEN
    RAISE EXCEPTION 'table not found' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = _tbl.restaurant_id AND r.is_active AND r.archived_at IS NULL) THEN
    RAISE EXCEPTION 'restaurant unavailable' USING ERRCODE = '22023';
  END IF;
  SELECT s.enable_waiter_calls INTO _enabled FROM public.restaurant_settings s WHERE s.restaurant_id = _tbl.restaurant_id;
  IF _enabled IS FALSE THEN
    RAISE EXCEPTION 'waiter calls disabled' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.waiter_calls (restaurant_id, table_id, status, note)
  VALUES (_tbl.restaurant_id, _tbl.id, 'pending', NULLIF(btrim(COALESCE(_note, '')), ''));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.public_call_waiter(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_call_waiter(text, text) TO anon, authenticated;