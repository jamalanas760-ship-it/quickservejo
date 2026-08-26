CREATE OR REPLACE FUNCTION public.create_restaurant_with_setup(
  _payload jsonb,
  _table_count integer DEFAULT 0
)
RETURNS TABLE (id uuid, name text, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  _rid uuid;
  _slug text;
  _name text;
  _count integer := LEAST(GREATEST(COALESCE(_table_count, 0), 0), 200);
BEGIN
  IF NOT app.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied to create restaurants' USING ERRCODE = '42501';
  END IF;

  _name := NULLIF(btrim(COALESCE(_payload->>'name', '')), '');
  _slug := NULLIF(btrim(lower(COALESCE(_payload->>'slug', ''))), '');
  IF _name IS NULL OR _slug IS NULL THEN
    RAISE EXCEPTION 'name and slug are required' USING ERRCODE = '22023';
  END IF;
  IF _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid slug' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.restaurants r WHERE r.slug = _slug) THEN
    RAISE EXCEPTION 'slug already exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.restaurants (
    name, slug, phone, email, address_en, address_ar, description_en, description_ar,
    logo_url, cover_image_url,
    primary_color, secondary_color, accent_color,
    default_language, currency, timezone, tax_rate, service_charge,
    subscription_plan, subscription_status
  )
  VALUES (
    _name, _slug,
    NULLIF(btrim(COALESCE(_payload->>'phone','')), ''),
    NULLIF(btrim(COALESCE(_payload->>'email','')), ''),
    NULLIF(btrim(COALESCE(_payload->>'address_en','')), ''),
    NULLIF(btrim(COALESCE(_payload->>'address_ar','')), ''),
    NULLIF(btrim(COALESCE(_payload->>'description_en','')), ''),
    NULLIF(btrim(COALESCE(_payload->>'description_ar','')), ''),
    NULLIF(btrim(COALESCE(_payload->>'logo_url','')), ''),
    NULLIF(btrim(COALESCE(_payload->>'cover_image_url','')), ''),
    COALESCE(NULLIF(_payload->>'primary_color',''), '#111827'),
    COALESCE(NULLIF(_payload->>'secondary_color',''), '#f5f5f4'),
    COALESCE(NULLIF(_payload->>'accent_color',''), '#f59e0b'),
    COALESCE(NULLIF(_payload->>'default_language',''), 'ar'),
    COALESCE(NULLIF(_payload->>'currency',''), 'JOD'),
    COALESCE(NULLIF(_payload->>'timezone',''), 'Asia/Amman'),
    COALESCE(NULLIF(_payload->>'tax_rate','')::numeric, 0),
    COALESCE(NULLIF(_payload->>'service_charge','')::numeric, 0),
    COALESCE(NULLIF(_payload->>'subscription_plan','')::public.subscription_plan, 'free'),
    COALESCE(NULLIF(_payload->>'subscription_status','')::public.subscription_status, 'trialing')
  )
  RETURNING public.restaurants.id INTO _rid;

  INSERT INTO public.restaurant_settings (restaurant_id) VALUES (_rid);

  IF _count > 0 THEN
    INSERT INTO public.restaurant_tables (restaurant_id, table_number, qr_token)
    SELECT _rid, i::text, gen_random_uuid()::text FROM generate_series(1, _count) AS g(i);
  END IF;

  INSERT INTO public.audit_logs (restaurant_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (_rid, auth.uid(), 'restaurant.created', 'restaurants', _rid,
          jsonb_build_object('name', _name, 'slug', _slug, 'tables', _count));

  RETURN QUERY SELECT _rid, _name, _slug;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_restaurant_with_setup(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_restaurant_with_setup(jsonb, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.restaurant_slug_available(_slug text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
  SELECT app.is_super_admin()
     AND NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.slug = lower(btrim(_slug)));
$function$;

REVOKE ALL ON FUNCTION public.restaurant_slug_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_slug_available(text) TO authenticated;