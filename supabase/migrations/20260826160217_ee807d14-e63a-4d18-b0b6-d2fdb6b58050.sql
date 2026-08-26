alter table public.restaurants add column if not exists menu_theme jsonb not null default '{}'::jsonb;
alter table public.restaurants add column if not exists staff_code text;
update public.restaurants set staff_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)) where staff_code is null;
create unique index if not exists restaurants_staff_code_key on public.restaurants(staff_code);

create table if not exists public.staff_credentials (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  pin_hash text,
  login_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.staff_credentials to service_role;
alter table public.staff_credentials enable row level security;

drop trigger if exists trg_staff_credentials_updated on public.staff_credentials;
create trigger trg_staff_credentials_updated before update on public.staff_credentials
for each row execute function public.set_updated_at();

do $$
begin
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.order_items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.waiter_calls;
  exception when duplicate_object then null;
  end;
end $$;