-- QuickServe PDF Menu + QR Ordering
create table if not exists public.restaurant_pdf_menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_url text not null,
  file_size bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists restaurant_pdf_menus_one_active
  on public.restaurant_pdf_menus(restaurant_id)
  where is_active = true;

create index if not exists restaurant_pdf_menus_restaurant_idx
  on public.restaurant_pdf_menus(restaurant_id, created_at desc);

alter table public.restaurant_pdf_menus enable row level security;

-- Public diners may read the active PDF for the restaurant.
drop policy if exists "Public can read active PDF menus" on public.restaurant_pdf_menus;
create policy "Public can read active PDF menus"
  on public.restaurant_pdf_menus for select
  using (is_active = true);

-- Authenticated management sessions can manage PDF records. The application already
-- scopes restaurant management routes to the current owner/staff workspace.
drop policy if exists "Authenticated can insert PDF menus" on public.restaurant_pdf_menus;
create policy "Authenticated can insert PDF menus"
  on public.restaurant_pdf_menus for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "Authenticated can update PDF menus" on public.restaurant_pdf_menus;
create policy "Authenticated can update PDF menus"
  on public.restaurant_pdf_menus for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "Authenticated can delete PDF menus" on public.restaurant_pdf_menus;
create policy "Authenticated can delete PDF menus"
  on public.restaurant_pdf_menus for delete to authenticated
  using (auth.uid() is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-pdf-menus', 'restaurant-pdf-menus', true, 20971520, array['application/pdf']::text[])
on conflict (id) do update set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf']::text[];

-- Public read access for published PDF files.
drop policy if exists "Public can read restaurant PDF menus" on storage.objects;
create policy "Public can read restaurant PDF menus"
  on storage.objects for select
  using (bucket_id = 'restaurant-pdf-menus');

-- Authenticated users may upload/update/delete menu PDFs. The application route scopes
-- management to the active restaurant workspace.
drop policy if exists "Authenticated can upload restaurant PDF menus" on storage.objects;
create policy "Authenticated can upload restaurant PDF menus"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'restaurant-pdf-menus');

drop policy if exists "Authenticated can update restaurant PDF menus" on storage.objects;
create policy "Authenticated can update restaurant PDF menus"
  on storage.objects for update to authenticated
  using (bucket_id = 'restaurant-pdf-menus')
  with check (bucket_id = 'restaurant-pdf-menus');

drop policy if exists "Authenticated can delete restaurant PDF menus" on storage.objects;
create policy "Authenticated can delete restaurant PDF menus"
  on storage.objects for delete to authenticated
  using (bucket_id = 'restaurant-pdf-menus');

create or replace function public.touch_restaurant_pdf_menu()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_pdf_menus_touch on public.restaurant_pdf_menus;
create trigger restaurant_pdf_menus_touch
before update on public.restaurant_pdf_menus
for each row execute function public.touch_restaurant_pdf_menu();
