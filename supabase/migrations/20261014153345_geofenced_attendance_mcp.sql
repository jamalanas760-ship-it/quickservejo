begin;
alter table public.restaurants add column if not exists geofence_radius_meters integer not null default 100 check(geofence_radius_meters between 50 and 300);
alter table public.staff_time_entries add column if not exists clock_in_location jsonb;
alter table public.staff_time_entries add column if not exists clock_out_location jsonb;
-- Keep privileged punch updates private; authenticated callers can only punch as themselves.
create or replace function app.clock_staff_geofenced(_restaurant_id uuid,_action text,_latitude double precision default null,_longitude double precision default null,_accuracy double precision default null,_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid;r public.restaurants%rowtype;p record;v jsonb;d double precision;a double precision;status text;reason text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into s from public.staff where restaurant_id=_restaurant_id and auth_user_id=auth.uid() and is_active order by updated_at desc limit 1;
 if s is null then raise exception 'Active staff profile not found' using errcode='42501';end if;
 if _action is null or _action not in ('in','out') then raise exception 'Invalid punch action' using errcode='22023';end if;
 if (_latitude is null)<>(_longitude is null) or (_latitude is not null and not(_latitude between -90 and 90 and _longitude between -180 and 180)) or (_accuracy is not null and not(_accuracy between 0 and 100000)) then raise exception 'Invalid GPS coordinates' using errcode='22023';end if;
 select * into r from public.restaurants where id=_restaurant_id;
 if r.latitude is null or r.longitude is null then status:='not_configured';
 elsif _latitude is null then status:='unverified';reason:=case when _reason in ('permission_denied','timeout','unavailable','invalid') then _reason else 'unavailable' end;
 else
 a:=sin(radians(r.latitude::double precision-_latitude)/2)^2+cos(radians(_latitude))*cos(radians(r.latitude::double precision))*sin(radians(r.longitude::double precision-_longitude)/2)^2;
 d:=6371000*2*atan2(sqrt(least(1,a)),sqrt(greatest(0,1-a)));
 if _accuracy is null or _accuracy>r.geofence_radius_meters then status:='unverified';reason:='inaccurate';else status:=case when d<=r.geofence_radius_meters then 'on_premise' else 'off_premise' end;end if;
 end if;
 v:=jsonb_build_object('status',status,'distance_meters',case when d is null then null else round(d::numeric,1) end,'latitude',_latitude,'longitude',_longitude,'accuracy_meters',_accuracy,'reason',reason,'radius_meters',r.geofence_radius_meters,'verified_at',now());
 if _action='in' then select * into p from public.clock_in_staff(_restaurant_id);else select * into p from public.clock_out_staff(_restaurant_id);end if;
 if p.action='clocked_in' then update public.staff_time_entries set clock_in_location=v where id=p.entry_id and staff_id=s and restaurant_id=_restaurant_id;
 elsif p.action='clocked_out' then update public.staff_time_entries set clock_out_location=v where id=p.entry_id and staff_id=s and restaurant_id=_restaurant_id;
 elsif p.entry_id is not null then select case when _action='in' then clock_in_location else clock_out_location end into v from public.staff_time_entries where id=p.entry_id and staff_id=s and restaurant_id=_restaurant_id;
 end if;
 if p.entry_id is null then v:=null;end if;
 return to_jsonb(p)||jsonb_build_object('verification',v);
end;$$;
revoke all on function app.clock_staff_geofenced(uuid,text,double precision,double precision,double precision,text) from public,anon;
grant execute on function app.clock_staff_geofenced(uuid,text,double precision,double precision,double precision,text) to authenticated;
create or replace function public.clock_staff_geofenced(_restaurant_id uuid,_action text,_latitude double precision default null,_longitude double precision default null,_accuracy double precision default null,_reason text default null)
returns jsonb language sql security invoker set search_path='' as $$select app.clock_staff_geofenced(_restaurant_id,_action,_latitude,_longitude,_accuracy,_reason);$$;
revoke all on function public.clock_staff_geofenced(uuid,text,double precision,double precision,double precision,text) from public,anon;
grant execute on function public.clock_staff_geofenced(uuid,text,double precision,double precision,double precision,text) to authenticated;

create or replace function public.mcp_table_availability(_restaurant_id uuid,_date date,_time time,_party_size integer,_duration_minutes integer default 90)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tz text;t timestamptz;result jsonb;
begin
 if auth.uid() is null or not(app.has_capability(_restaurant_id,'manage_tables') or app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501';end if;
 if _date is null or _time is null or _party_size is null or _party_size not between 1 and 100 or _duration_minutes is null or _duration_minutes not between 15 and 480 then raise exception 'Invalid booking inputs' using errcode='22023';end if;
 select timezone into tz from public.restaurants where id=_restaurant_id;
 if tz is null then raise exception 'Restaurant not found or inaccessible' using errcode='42501';end if;
 t:=(_date+_time) at time zone tz;
 select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into result from public.find_available_booking_tables(_restaurant_id,t,_party_size,_duration_minutes) a;
 return jsonb_build_object('tables',result,'booking_at',t,'timezone',tz);
end;$$;
revoke all on function public.mcp_table_availability(uuid,date,time,integer,integer) from public,anon;
grant execute on function public.mcp_table_availability(uuid,date,time,integer,integer) to authenticated;

create or replace function public.mcp_create_reservation(_restaurant_id uuid,_date date,_time time,_party_size integer,_customer_name text,_phone text default null,_email text default null,_table_id uuid default null,_duration_minutes integer default 90,_notes text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare info jsonb;booking uuid;
begin
 -- Validate access and inputs before taking a tenant-scoped reservation lock.
 info:=public.mcp_table_availability(_restaurant_id,_date,_time,_party_size,_duration_minutes);
 if nullif(trim(_customer_name),'') is null or length(_customer_name)>120 or length(coalesce(_notes,''))>1000 then raise exception 'Invalid guest details' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(_restaurant_id::text,9102));
 booking:=public.create_staff_booking(_restaurant_id,_customer_name,_phone,_email,_party_size,(info->>'booking_at')::timestamptz,_table_id,_duration_minutes,'confirmed',_notes,null,'staff');
 return jsonb_build_object('reservation_id',booking,'status','confirmed','booking_at',info->'booking_at','timezone',info->'timezone');
end;$$;
revoke all on function public.mcp_create_reservation(uuid,date,time,integer,text,text,text,uuid,integer,text) from public,anon;
grant execute on function public.mcp_create_reservation(uuid,date,time,integer,text,text,text,uuid,integer,text) to authenticated;

create or replace function public.mcp_daily_sales_summary(_restaurant_id uuid,_date date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare tz text;currency text;start_at timestamptz;end_at timestamptz;revenue numeric;count_orders bigint;items jsonb;
begin
 if auth.uid() is null or not(app.has_capability(_restaurant_id,'view_analytics') or app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501';end if;
 if _date is null then raise exception 'Date required' using errcode='22023';end if;
 select r.timezone,r.currency into tz,currency from public.restaurants r where r.id=_restaurant_id;
 if tz is null then raise exception 'Restaurant not found or inaccessible' using errcode='42501';end if;
 start_at:=_date::timestamp at time zone tz;end_at:=(_date+1)::timestamp at time zone tz;
 select coalesce(sum(o.total),0),count(*) into revenue,count_orders from public.orders o where o.restaurant_id=_restaurant_id and o.payment_status='paid' and o.status<>'cancelled' and coalesce(o.paid_at,o.created_at)>=start_at and coalesce(o.paid_at,o.created_at)<end_at;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into items from (select i.menu_item_id,i.product_name_snapshot_en name_en,i.product_name_snapshot_ar name_ar,sum(i.quantity) quantity,sum(i.total_price) revenue from public.order_items i join public.orders o on o.id=i.order_id and o.restaurant_id=i.restaurant_id where i.restaurant_id=_restaurant_id and o.restaurant_id=_restaurant_id and o.payment_status='paid' and o.status<>'cancelled' and coalesce(o.paid_at,o.created_at)>=start_at and coalesce(o.paid_at,o.created_at)<end_at group by i.menu_item_id,i.product_name_snapshot_en,i.product_name_snapshot_ar order by sum(i.quantity) desc,i.menu_item_id limit 10)x;
 return jsonb_build_object('date',_date,'timezone',tz,'currency',currency,'revenue',revenue,'order_count',count_orders,'top_selling_items',items,'basis','paid orders by paid_at, created_at fallback');
end;$$;
revoke all on function public.mcp_daily_sales_summary(uuid,date) from public,anon;
grant execute on function public.mcp_daily_sales_summary(uuid,date) to authenticated;

create or replace function public.mcp_attendance_status(_restaurant_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not(app.has_capability(_restaurant_id,'manage_shifts') or app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (select e.id entry_id,s.id staff_id,s.name,e.clock_in,e.clock_in_location verification,exists(select 1 from public.shift_assignments a where a.restaurant_id=_restaurant_id and a.staff_id=s.id and a.status<>'released' and a.starts_at<=now() and a.ends_at>now()) on_scheduled_shift from public.staff_time_entries e join public.staff s on s.id=e.staff_id and s.restaurant_id=e.restaurant_id where e.restaurant_id=_restaurant_id and e.clock_out is null and e.clock_in<=now() and e.clock_in>now()-interval '24 hours' and e.review_status<>'rejected' and s.is_active order by e.clock_in)x;
 return jsonb_build_object('clocked_in',result,'as_of',now());
end;$$;
revoke all on function public.mcp_attendance_status(uuid) from public,anon;
grant execute on function public.mcp_attendance_status(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
