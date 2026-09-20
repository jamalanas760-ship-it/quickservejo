begin;

create or replace function public.get_operational_forecast(
  _restaurant_id uuid,
  _target_date date default (current_date + 1)
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _tz text;
  _target_dow int;
  _lookback_start date := _target_date - 28;
  _same_weekday_days int := 0;
  _sample_days int := 0;
  _confidence text := 'low';
  _method text := 'same_weekday_28d';
  _result jsonb;
begin
  if not (
    app.has_capability(_restaurant_id,'view_analytics')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select coalesce(nullif(timezone,''),'UTC') into _tz
  from public.restaurants
  where id=_restaurant_id;

  if _tz is null then
    raise exception 'Restaurant not found' using errcode='22023';
  end if;

  _target_dow := extract(dow from _target_date)::int;

  select count(distinct ((o.created_at at time zone _tz)::date))::int
    into _same_weekday_days
  from public.orders o
  where o.restaurant_id=_restaurant_id
    and o.payment_status='paid'
    and (o.created_at at time zone _tz)::date >= _lookback_start
    and (o.created_at at time zone _tz)::date < _target_date
    and extract(dow from (o.created_at at time zone _tz))::int = _target_dow;

  if _same_weekday_days < 2 then
    _method := 'all_days_28d_fallback';
  end if;

  with paid_orders as (
    select
      o.id,
      o.total::numeric as total,
      (o.created_at at time zone _tz)::date as local_date,
      extract(hour from (o.created_at at time zone _tz))::int as local_hour
    from public.orders o
    where o.restaurant_id=_restaurant_id
      and o.payment_status='paid'
      and (o.created_at at time zone _tz)::date >= _lookback_start
      and (o.created_at at time zone _tz)::date < _target_date
      and (
        _method='all_days_28d_fallback'
        or extract(dow from (o.created_at at time zone _tz))::int = _target_dow
      )
  ),
  sample_dates as (
    select distinct local_date from paid_orders
  ),
  daily as (
    select local_date, count(*)::numeric as orders, coalesce(sum(total),0)::numeric as sales
    from paid_orders
    group by local_date
  ),
  sample_stats as (
    select
      count(*)::int as sample_days,
      coalesce(avg(orders),0)::numeric as expected_orders,
      coalesce(avg(sales),0)::numeric as expected_sales,
      case when coalesce(sum(orders),0)>0 then coalesce(sum(sales),0)/sum(orders) else 0 end::numeric as avg_order_value
    from daily
  ),
  hourly as (
    select
      h.hour,
      coalesce(avg(coalesce(x.orders,0)),0)::numeric as expected_orders,
      coalesce(avg(coalesce(x.sales,0)),0)::numeric as expected_sales
    from generate_series(0,23) h(hour)
    cross join sample_dates d
    left join (
      select local_date, local_hour, count(*)::numeric as orders, coalesce(sum(total),0)::numeric as sales
      from paid_orders
      group by local_date, local_hour
    ) x on x.local_date=d.local_date and x.local_hour=h.hour
    group by h.hour
    order by h.hour
  ),
  item_daily as (
    select
      po.local_date,
      oi.menu_item_id,
      max(coalesce(nullif(oi.product_name_snapshot_en,''), nullif(oi.product_name_snapshot_ar,''), 'Item')) as item_name,
      sum(oi.quantity)::numeric as quantity
    from paid_orders po
    join public.order_items oi on oi.order_id=po.id and oi.restaurant_id=_restaurant_id
    where oi.menu_item_id is not null
    group by po.local_date, oi.menu_item_id
  ),
  item_forecast as (
    select
      i.menu_item_id,
      max(i.item_name) as item_name,
      avg(i.quantity)::numeric as expected_quantity
    from item_daily i
    group by i.menu_item_id
  ),
  top_items as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'menu_item_id', menu_item_id,
      'name', item_name,
      'expected_quantity', round(expected_quantity,1)
    ) order by expected_quantity desc), '[]'::jsonb) as value
    from (
      select * from item_forecast
      order by expected_quantity desc
      limit 10
    ) q
  ),
  ingredient_forecast as (
    select
      ri.inventory_item_id,
      inv.name,
      inv.unit,
      sum(
        f.expected_quantity
        * (ri.quantity / greatest(r.yield_quantity,0.000001))
        * (1 + coalesce(ri.waste_percent,0)/100)
      )::numeric as expected_quantity
    from item_forecast f
    join public.erp_menu_recipes r
      on r.restaurant_id=_restaurant_id and r.menu_item_id=f.menu_item_id
    join public.erp_recipe_items ri
      on ri.restaurant_id=_restaurant_id and ri.recipe_id=r.id
    join public.erp_inventory inv
      on inv.restaurant_id=_restaurant_id and inv.id=ri.inventory_item_id
    group by ri.inventory_item_id, inv.name, inv.unit
  ),
  ingredients as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'inventory_item_id', inventory_item_id,
      'name', name,
      'unit', unit,
      'expected_quantity', round(expected_quantity,3)
    ) order by expected_quantity desc), '[]'::jsonb) as value
    from (
      select * from ingredient_forecast
      order by expected_quantity desc
      limit 15
    ) q
  ),
  labor_by_day as (
    select
      d.local_date,
      coalesce(sum(
        greatest(
          0,
          extract(epoch from (
            least(coalesce(te.clock_out, ((d.local_date + 1)::timestamp at time zone _tz)), ((d.local_date + 1)::timestamp at time zone _tz))
            - greatest(te.clock_in, (d.local_date::timestamp at time zone _tz))
          )) / 3600
          - (te.break_minutes::numeric/60)
        )
      ),0)::numeric as hours
    from sample_dates d
    left join public.staff_time_entries te
      on te.restaurant_id=_restaurant_id
      and te.clock_in < ((d.local_date + 1)::timestamp at time zone _tz)
      and coalesce(te.clock_out, ((d.local_date + 1)::timestamp at time zone _tz)) > (d.local_date::timestamp at time zone _tz)
    group by d.local_date
  ),
  labor_stats as (
    select coalesce(avg(hours),0)::numeric as expected_hours
    from labor_by_day
  ),
  peak as (
    select hour, expected_orders
    from hourly
    order by expected_orders desc, hour
    limit 1
  )
  select
    s.sample_days,
    jsonb_build_object(
      'target_date', _target_date,
      'timezone', _tz,
      'method', _method,
      'sample_days', s.sample_days,
      'expected_sales', round(s.expected_sales,3),
      'expected_orders', round(s.expected_orders,1),
      'average_order_value', round(s.avg_order_value,3),
      'hourly', coalesce((select jsonb_agg(jsonb_build_object(
        'hour', hour,
        'expected_orders', round(expected_orders,1),
        'expected_sales', round(expected_sales,3)
      ) order by hour) from hourly), '[]'::jsonb),
      'top_items', (select value from top_items),
      'ingredients', (select value from ingredients),
      'labor', jsonb_build_object(
        'expected_hours', round((select expected_hours from labor_stats),1),
        'historical_orders_per_labor_hour',
          case when (select expected_hours from labor_stats)>0 then round(s.expected_orders/(select expected_hours from labor_stats),2) else null end,
        'peak_hour', (select hour from peak),
        'peak_hour_expected_orders', round(coalesce((select expected_orders from peak),0),1)
      )
    )
  into _sample_days, _result
  from sample_stats s;

  _confidence := case
    when _sample_days >= 4 and _method='same_weekday_28d' then 'high'
    when _sample_days >= 3 then 'medium'
    else 'low'
  end;

  return coalesce(_result,'{}'::jsonb) || jsonb_build_object(
    'confidence', _confidence,
    'data_sufficiency',
      case
        when _sample_days=0 then 'insufficient'
        when _sample_days<3 then 'limited'
        else 'usable'
      end
  );
end;
$$;

revoke all on function public.get_operational_forecast(uuid,date) from public, anon;
grant execute on function public.get_operational_forecast(uuid,date) to authenticated;

notify pgrst, 'reload schema';
commit;
