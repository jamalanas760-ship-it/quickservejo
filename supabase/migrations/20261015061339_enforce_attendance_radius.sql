begin;
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
 if status='not_configured' then raise exception 'Attendance location is not configured' using errcode='P0001';end if;
 if status='off_premise' then raise exception 'Outside attendance radius' using errcode='P0001';end if;
 if status<>'on_premise' then raise exception 'Accurate GPS location required' using errcode='P0001';end if;
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


-- Old coordinate-free endpoints must not bypass the geofence.
revoke execute on function public.clock_in_staff(uuid) from public,anon,authenticated;
revoke execute on function public.clock_out_staff(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
