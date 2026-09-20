create or replace function public.public_call_waiter(_qr_token text,_note text default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _table public.restaurant_tables%rowtype;
  _id uuid;
begin
  if nullif(btrim(coalesce(_qr_token,'')),'') is null then raise exception 'invalid table'; end if;
  select * into _table from public.restaurant_tables
  where qr_token=btrim(_qr_token) and is_active
  limit 1;
  if _table.id is null then raise exception 'table not found'; end if;

  perform app.enforce_public_rate_limit('waiter-call:'||_table.id::text,3,60);

  select id into _id
  from public.waiter_calls
  where table_id=_table.id and status in ('pending','acknowledged')
    and created_at>now()-interval '10 minutes'
  order by created_at desc limit 1;

  if _id is not null then return _id; end if;

  insert into public.waiter_calls(restaurant_id,table_id,status,note)
  values(_table.restaurant_id,_table.id,'pending',nullif(left(btrim(coalesce(_note,'')),500),''))
  returning id into _id;
  return _id;
end;
$$;
revoke all on function public.public_call_waiter(text,text) from public;
grant execute on function public.public_call_waiter(text,text) to anon,authenticated;
