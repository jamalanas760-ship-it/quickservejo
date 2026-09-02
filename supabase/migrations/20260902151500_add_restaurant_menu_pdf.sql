-- Professional PDF menu storage for restaurant workspaces.
alter table public.restaurants
  add column if not exists menu_pdf_url text,
  add column if not exists menu_pdf_name text,
  add column if not exists menu_pdf_updated_at timestamptz;

insert into storage.buckets (id, name, public)
values ('menu-pdfs', 'menu-pdfs', true)
on conflict (id) do update set public = true;

-- Keep policies idempotent so the migration is safe to re-run in development.
drop policy if exists "menu-pdfs public read" on storage.objects;
drop policy if exists "menu-pdfs authenticated upload" on storage.objects;
drop policy if exists "menu-pdfs authenticated update" on storage.objects;
drop policy if exists "menu-pdfs authenticated delete" on storage.objects;

create policy "menu-pdfs public read"
on storage.objects
for select
to public
using (bucket_id = 'menu-pdfs');

create policy "menu-pdfs authenticated upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'menu-pdfs');

create policy "menu-pdfs authenticated update"
on storage.objects
for update
to authenticated
using (bucket_id = 'menu-pdfs')
with check (bucket_id = 'menu-pdfs');

create policy "menu-pdfs authenticated delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'menu-pdfs');
