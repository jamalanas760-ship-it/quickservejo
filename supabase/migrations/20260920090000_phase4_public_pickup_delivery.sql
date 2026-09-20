create or replace function public.place_public_fulfillment_order(
  _restaurant_slug text,
  _fulfillment text,
  _items jsonb,
  _notes text default null,
  _guest_name text default null,
  _guest_phone text default null,
  _guest_email text default null,
  _delivery_address text default null,
  _scheduled_for timestamptz default null
) returns table(order_id uuid,order_number text,public_token text,total numeric,currency text)
language plpgsql
security definer
set search_path=''
as $$
declare
  _rest public.restaurants;
  _settings public.restaurant_settings;
  _oid uuid;
  _num text;
  _token text:=replace(gen_random_uuid()::text,'-','');
  _subtotal numeric:=0;
  _tax numeric:=0;
  _svc numeric:=0;
  _delivery numeric:=0;
  _grand numeric:=0;
  _it jsonb;
  _item public.menu_items;
  _qty integer;
  _delta numeric;
  _mods jsonb;
  _unit numeric;
  _prefix text;
  _sequence bigint;
  _modifier_ids jsonb;
  _group public.modifier_groups;
  _selected_count integer;
  _guest_id uuid;
begin
  if _fulfillment not in ('pickup','delivery') then raise exception 'Unsupported fulfillment type' using errcode='22023'; end if;
  select * into _rest from public.restaurants r where r.slug=btrim(_restaurant_slug) and r.is_active and r.archived_at is null limit 1;
  if _rest.id is null then raise exception 'restaurant unavailable' using errcode='22023'; end if;
  perform app.enforce_public_rate_limit('online-order:'||_rest.id::text,20,60);
  select * into _settings from public.restaurant_settings s where s.restaurant_id=_rest.id;
  if _settings.id is null or not _settings.enable_orders then raise exception 'ordering disabled' using errcode='22023'; end if;
  if _fulfillment='pickup' and not coalesce(_settings.enable_pickup,false) then raise exception 'pickup disabled' using errcode='22023'; end if;
  if _fulfillment='delivery' and not coalesce(_settings.enable_delivery,false) then raise exception 'delivery disabled' using errcode='22023'; end if;
  if _fulfillment='delivery' and nullif(btrim(coalesce(_delivery_address,'')),'') is null then raise exception 'delivery address required' using errcode='22023'; end if;
  if (select count(*) from public.orders o where o.restaurant_id=_rest.id and o.status in ('new','accepted','preparing','ready')) >= greatest(coalesce(_settings.max_active_orders,100),1) then
    raise exception 'restaurant is temporarily at order capacity' using errcode='P0001';
  end if;
  if _items is null or jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)=0 then raise exception 'empty cart' using errcode='22023'; end if;
  if jsonb_array_length(_items)>100 then raise exception 'too many items' using errcode='22023'; end if;

  _prefix:='Q'||to_char(now(),'MMDD')||'-';
  perform pg_advisory_xact_lock(hashtextextended(_rest.id::text,0));
  select coalesce(max(substring(o.order_number from '[0-9]+$')::bigint),0)+1 into _sequence
  from public.orders o where o.restaurant_id=_rest.id and o.order_number~('^'||_prefix||'[0-9]+$');
  _num:=_prefix||lpad(_sequence::text,greatest(4,length(_sequence::text)),'0');
  _guest_id:=app.upsert_order_guest(_rest.id,_guest_name,_guest_phone,_guest_email);

  insert into public.orders(
    restaurant_id,table_id,order_number,status,payment_status,subtotal,tax_amount,service_amount,discount_amount,total,currency,
    customer_notes,public_token,guest_id,guest_name,guest_phone,guest_email,fulfillment_type,scheduled_for,delivery_address
  ) values(
    _rest.id,null,_num,'new','unpaid',0,0,0,0,0,_rest.currency,nullif(btrim(coalesce(_notes,'')),''),_token,
    _guest_id,nullif(btrim(coalesce(_guest_name,'')),''),nullif(btrim(coalesce(_guest_phone,'')),''),
    nullif(lower(btrim(coalesce(_guest_email,''))),''),
    _fulfillment,_scheduled_for,nullif(btrim(coalesce(_delivery_address,'')),'')
  ) returning id into _oid;

  for _it in select * from jsonb_array_elements(_items) loop
    select * into _item from public.menu_items m
    where m.id=(_it->>'menu_item_id')::uuid and m.restaurant_id=_rest.id and m.is_available;
    if _item.id is null then raise exception 'item unavailable' using errcode='22023'; end if;
    if jsonb_typeof(_it->'quantity') is distinct from 'number'
       or (_it->>'quantity')::numeric<>trunc((_it->>'quantity')::numeric)
       or (_it->>'quantity')::numeric not between 1 and 50 then raise exception 'invalid quantity' using errcode='22023'; end if;
    _qty:=(_it->>'quantity')::integer;
    _modifier_ids:=coalesce(_it->'modifier_ids','[]'::jsonb);
    if jsonb_typeof(_modifier_ids)<>'array' then raise exception 'invalid modifiers' using errcode='22023'; end if;
    select coalesce(sum(mo.price_delta),0),
           coalesce(jsonb_agg(jsonb_build_object('id',mo.id,'name_en',mo.name_en,'name_ar',mo.name_ar,'price_delta',mo.price_delta)),'[]'::jsonb)
      into _delta,_mods
    from public.item_modifiers mo
    join public.modifier_groups mg on mg.id=mo.group_id and mg.menu_item_id=_item.id and mg.restaurant_id=_rest.id and mg.is_active
    where mo.menu_item_id=_item.id and mo.restaurant_id=_rest.id and mo.is_active
      and mo.id::text=any(select jsonb_array_elements_text(_modifier_ids));
    if jsonb_array_length(_mods)<>jsonb_array_length(_modifier_ids) then raise exception 'invalid modifiers' using errcode='22023'; end if;
    for _group in select * from public.modifier_groups g where g.menu_item_id=_item.id and g.restaurant_id=_rest.id and g.is_active loop
      select count(*) into _selected_count from public.item_modifiers m
      where m.group_id=_group.id and m.menu_item_id=_item.id and m.restaurant_id=_rest.id and m.is_active
        and m.id::text in(select jsonb_array_elements_text(_modifier_ids));
      if _selected_count<greatest(_group.min_selection,case when _group.is_required then 1 else 0 end)
         or _selected_count>_group.max_selection then raise exception 'invalid modifier selection' using errcode='22023'; end if;
    end loop;
    _unit:=_item.price+coalesce(_delta,0);
    _subtotal:=_subtotal+(_unit*_qty);
    insert into public.order_items(
      restaurant_id,order_id,menu_item_id,product_name_snapshot_ar,product_name_snapshot_en,
      quantity,unit_price,total_price,notes,selected_modifiers
    ) values(
      _rest.id,_oid,_item.id,_item.name_ar,_item.name_en,_qty,_unit,_unit*_qty,
      nullif(btrim(coalesce(_it->>'notes','')),''),coalesce(_mods,'[]'::jsonb)
    );
  end loop;

  _tax:=round(_subtotal*coalesce(_rest.tax_rate,0)/100.0,2);
  if _fulfillment='delivery' then _delivery:=greatest(coalesce(_settings.delivery_fee,0),0); end if;
  _grand:=round(_subtotal,2)+_tax+_svc+_delivery;
  if _settings.minimum_order>0 and round(_subtotal,2)<_settings.minimum_order then raise exception 'below minimum order' using errcode='22023'; end if;
  update public.orders set subtotal=round(_subtotal,2),tax_amount=_tax,service_amount=_svc,total=_grand where id=_oid;
  return query select _oid,_num,_token,_grand,_rest.currency;
end;
$$;
revoke all on function public.place_public_fulfillment_order(text,text,jsonb,text,text,text,text,text,timestamptz) from public;
grant execute on function public.place_public_fulfillment_order(text,text,jsonb,text,text,text,text,text,timestamptz) to anon,authenticated;
