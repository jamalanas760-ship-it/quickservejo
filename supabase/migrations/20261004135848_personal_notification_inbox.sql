-- Deleting an alert affects only the current recipient, including shared role alerts.
create table public.notification_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  notification_id uuid not null references public.in_app_notifications(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
alter table public.notification_dismissals enable row level security;
grant select, insert, delete on public.notification_dismissals to authenticated;
create policy notification_dismissals_select on public.notification_dismissals for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_dismissals_insert on public.notification_dismissals for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.in_app_notifications n where n.id = notification_id
  ));
create policy notification_dismissals_delete on public.notification_dismissals for delete to authenticated
  using (user_id = (select auth.uid()));
create index notification_dismissals_notification_idx on public.notification_dismissals(notification_id);

create view public.visible_notifications with (security_invoker = true) as
  select n.* from public.in_app_notifications n
  where not exists (select 1 from public.notification_dismissals d
    where d.notification_id = n.id and d.user_id = (select auth.uid()));
grant select on public.visible_notifications to authenticated;

create function public.dismiss_notifications(_restaurant_id uuid, _ids uuid[] default null, _before timestamptz default now())
returns uuid[] language sql security invoker set search_path = '' as $$
  with removed as (
    insert into public.notification_dismissals(user_id, notification_id)
      select auth.uid(), n.id from public.visible_notifications n
      where n.restaurant_id = _restaurant_id and n.created_at <= least(_before, now())
        and (_ids is null or n.id = any(_ids))
      on conflict do nothing returning notification_id
  ) select coalesce(array_agg(notification_id), '{}'::uuid[]) from removed;
$$;
revoke all on function public.dismiss_notifications(uuid,uuid[],timestamptz) from public, anon;
grant execute on function public.dismiss_notifications(uuid,uuid[],timestamptz) to authenticated;

-- Aggregate in Postgres so busy yearly reports never hit the client row limit.
create function public.home_period_overview(_restaurant_id uuid, _start timestamptz, _end timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'sales', (select coalesce(sum(total),0) from public.orders where restaurant_id=_restaurant_id and created_at>=_start and created_at<_end and status<>'cancelled'),
    'orderCount', (select count(*) from public.orders where restaurant_id=_restaurant_id and created_at>=_start and created_at<_end and status<>'cancelled'),
    'orders', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from (
      select o.id,o.order_number,o.status,o.total, case when t.id is not null then jsonb_build_object('table_number',t.table_number) end as "table"
      from public.orders o left join public.restaurant_tables t on t.id=o.table_id
      where o.restaurant_id=_restaurant_id and o.created_at>=_start and o.created_at<_end and o.status<>'cancelled'
      order by o.created_at desc limit 3) o),
    'bookingCount', (select count(*) from public.table_bookings where restaurant_id=_restaurant_id and booking_at>=_start and booking_at<_end and status not in ('cancelled','no_show')),
    'bookings', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from (
      select b.id,b.booking_at,b.customer_name,b.guest_count, case when t.id is not null then jsonb_build_object('table_number',t.table_number) end as "table"
      from public.table_bookings b left join public.restaurant_tables t on t.id=b.table_id
      where b.restaurant_id=_restaurant_id and b.booking_at>=_start and b.booking_at<_end and b.status not in ('cancelled','no_show')
      order by b.booking_at desc limit 3) b)
  );
$$;
revoke all on function public.home_period_overview(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.home_period_overview(uuid,timestamptz,timestamptz) to authenticated;
