create function public.import_staff_hr_setups(_restaurant_id uuid,_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; n int:=0;begin
 if not(app.has_restaurant_access(_restaurant_id) and app.has_capability(_restaurant_id,'manage_shifts')) then raise exception 'Not authorized';end if;
 if jsonb_typeof(_rows) is distinct from 'array' or jsonb_array_length(_rows) not between 1 and 200 then raise exception 'Import between 1 and 200 employees';end if;
 if (select count(distinct value->>'staff_id') from jsonb_array_elements(_rows))<>jsonb_array_length(_rows) then raise exception 'Duplicate or missing employee IDs';end if;
 for item in select value from jsonb_array_elements(_rows) loop
  if not exists(select 1 from public.staff where id=(item->>'staff_id')::uuid and restaurant_id=_restaurant_id) then raise exception 'Employee is outside this workspace';end if;
  perform public.save_staff_hr_setup((item->>'staff_id')::uuid,item->'employment',item->'setup');n:=n+1;
 end loop;
 return jsonb_build_object('imported',n);
end $$;
revoke all on function public.import_staff_hr_setups(uuid,jsonb) from public,anon;
grant execute on function public.import_staff_hr_setups(uuid,jsonb) to authenticated;
