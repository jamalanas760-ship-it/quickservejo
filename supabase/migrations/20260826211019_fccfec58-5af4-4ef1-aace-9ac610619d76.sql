CREATE TABLE public.staff_login_secrets (
  staff_id uuid PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  email text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.staff_login_secrets TO service_role;

ALTER TABLE public.staff_login_secrets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_staff_login_secrets_updated_at
BEFORE UPDATE ON public.staff_login_secrets
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();