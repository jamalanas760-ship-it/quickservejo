CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;

ALTER FUNCTION public.is_super_admin() SET SCHEMA app;
ALTER FUNCTION public.has_restaurant_access(uuid) SET SCHEMA app;
ALTER FUNCTION public.has_restaurant_role(uuid, public.app_role[]) SET SCHEMA app;
ALTER FUNCTION public.can_manage_restaurant(uuid) SET SCHEMA app;
ALTER FUNCTION public.is_restaurant_public(uuid) SET SCHEMA app;

ALTER FUNCTION app.is_super_admin() SET search_path = app, public;
ALTER FUNCTION app.has_restaurant_access(uuid) SET search_path = app, public;
ALTER FUNCTION app.has_restaurant_role(uuid, public.app_role[]) SET search_path = app, public;
ALTER FUNCTION app.can_manage_restaurant(uuid) SET search_path = app, public;
ALTER FUNCTION app.is_restaurant_public(uuid) SET search_path = app, public;

CREATE OR REPLACE FUNCTION app.has_restaurant_role(_restaurant_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT app.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid() AND s.is_active
      AND s.restaurant_id = _restaurant_id AND s.role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION app.can_manage_restaurant(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT app.has_restaurant_role(_restaurant_id, ARRAY['restaurant_admin','manager']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION app.has_restaurant_access(_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT app.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid() AND s.is_active AND s.restaurant_id = _restaurant_id
  );
$$;