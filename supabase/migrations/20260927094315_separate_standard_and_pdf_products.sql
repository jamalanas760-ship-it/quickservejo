-- Give every menu item a durable source so Standard and Clickable PDF menus
-- never depend on the current hotspot/link state to decide ownership.
alter table public.menu_items
  add column if not exists menu_origin text;

update public.menu_items item
set menu_origin = 'pdf'
where item.menu_origin is null
  and exists (
    select 1
    from public.menu_pdf_item_links link
    where link.menu_item_id = item.id
      and link.restaurant_id = item.restaurant_id
  );

update public.menu_items
set menu_origin = 'standard'
where menu_origin is null;

alter table public.menu_items
  alter column menu_origin set default 'standard',
  alter column menu_origin set not null;

alter table public.menu_items
  drop constraint if exists menu_items_menu_origin_check;

alter table public.menu_items
  add constraint menu_items_menu_origin_check
  check (menu_origin in ('standard', 'pdf'));

create index if not exists menu_items_restaurant_origin_order_idx
  on public.menu_items(restaurant_id, menu_origin, display_order);
