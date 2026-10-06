-- Align the order RPC with manager-controlled feature permissions.
create or replace function public.transition_order_status(
  _order_id uuid,
  _next public.order_status,
  _note text default null
) returns public.orders
language plpgsql
security definer
set search_path=''
as $$
declare
  _order public.orders;
  _allowed boolean := false;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then
    raise exception 'Order not found' using errcode='22023';
  end if;

  if not (app.has_restaurant_access(_order.restaurant_id) or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  -- Job roles provide defaults; explicit feature grants/revocations govern writes.
  -- Payment completion has its own permission rather than a status-update bypass.
  if not app.has_capability(_order.restaurant_id,
    case when _next='paid' then 'manage_payments' else 'update_order_status' end
  ) then
    raise exception 'Order action is not permitted' using errcode='42501';
  end if;

  _allowed := case
    when _order.status='new' and _next='accepted' then true
    when _order.status='accepted' and _next='preparing' then true
    when _order.status='preparing' and _next='ready' then true
    when _order.status='ready' and _next='served' then true
    when _order.status='served' and _next='paid' then true
    when _next='cancelled' and _order.status in ('new','accepted','preparing','ready') then true
    else false
  end;

  if not _allowed then
    raise exception 'Invalid order status transition from % to %', _order.status, _next using errcode='22023';
  end if;

  update public.orders
  set status=_next,
      accepted_at=case when _next='accepted' and accepted_at is null then now() else accepted_at end,
      preparing_at=case when _next='preparing' and preparing_at is null then now() else preparing_at end,
      ready_at=case when _next='ready' and ready_at is null then now() else ready_at end,
      served_at=case when _next='served' and served_at is null then now() else served_at end,
      paid_at=case when _next='paid' and paid_at is null then now() else paid_at end,
      cancellation_note=case when _next='cancelled' then nullif(left(trim(coalesce(_note,'')),500),'') else cancellation_note end,
      cancelled_at=case when _next='cancelled' then now() else cancelled_at end,
      updated_at=now()
  where id=_order_id
  returning * into _order;

  return _order;
end;
$$;

revoke all on function public.transition_order_status(uuid,public.order_status,text) from public, anon;
grant execute on function public.transition_order_status(uuid,public.order_status,text) to authenticated;
