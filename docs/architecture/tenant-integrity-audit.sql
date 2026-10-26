-- Read-only audit. Run with a trusted administrative connection; an RLS-bound
-- client may hide rows and produce a misleading zero. Returns counts only.
-- Zero means no existing mismatches, not that future mismatches are prevented.
select 'order_items.order_id' as relationship, count(*) as cross_restaurant_rows
from public.order_items c join public.orders p on p.id = c.order_id
where c.restaurant_id is distinct from p.restaurant_id
union all
select 'order_items.menu_item_id', count(*)
from public.order_items c join public.menu_items p on p.id = c.menu_item_id
where c.restaurant_id is distinct from p.restaurant_id
union all
select 'orders.table_id', count(*)
from public.orders c join public.restaurant_tables p on p.id = c.table_id
where c.restaurant_id is distinct from p.restaurant_id
union all
select 'shift_assignments.staff_id', count(*)
from public.shift_assignments c join public.staff p on p.id = c.staff_id
where c.restaurant_id is distinct from p.restaurant_id
union all
select 'shift_assignments.shift_id', count(*)
from public.shift_assignments c join public.shifts p on p.id = c.shift_id
where c.restaurant_id is distinct from p.restaurant_id
union all
select 'staff_time_entries.staff_id', count(*)
from public.staff_time_entries c join public.staff p on p.id = c.staff_id
where c.restaurant_id is distinct from p.restaurant_id;

-- Exposed tables without RLS. Expected: no rows. RLS being enabled is not proof
-- that policies enforce the right permissions; test them with separate users.
select c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
