-- QuickServe PDF menu source + QR ordering.
alter table public.restaurants
  add column if not exists menu_pdf_url text,
  add column if not exists menu_pdf_name text,
  add column if not exists menu_pdf_updated_at timestamptz;

insert into storage.buckets (id, name, public)
values ('menu-pdfs', 'menu-pdfs', true)
on conflict (id) do update set public = true;

create policy "Authenticated users can upload restaurant menu PDFs"
on storage.objects for insert to authenticated
with check (bucket_id = 'menu-pdfs');

create policy "Authenticated users can replace restaurant menu PDFs"
on storage.objects for update to authenticated
using (bucket_id = 'menu-pdfs')
with check (bucket_id = 'menu-pdfs');

create policy "Authenticated users can remove restaurant menu PDFs"
on storage.objects for delete to authenticated
using (bucket_id = 'menu-pdfs');
