-- Anonymous diners already hold an unguessable receipt capability in the order URL.
-- Broadcast only an invalidation hint on its SHA-256-derived topic. No order data
-- or raw capability token is published; the receipt RPC remains authoritative.
set local lock_timeout = '100ms';
set local statement_timeout = '5s';
lock table public.orders in share row exclusive mode nowait;

create or replace function app.notify_public_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  tokens text[];
  token text;
  topic text;
begin
  if TG_OP = 'UPDATE' then
    if row(NEW.public_token,NEW.order_number,NEW.status,NEW.payment_status,
           NEW.subtotal,NEW.tax_amount,NEW.service_amount,NEW.discount_amount,
           NEW.total,NEW.currency,NEW.created_at)
       is not distinct from
       row(OLD.public_token,OLD.order_number,OLD.status,OLD.payment_status,
           OLD.subtotal,OLD.tax_amount,OLD.service_amount,OLD.discount_amount,
           OLD.total,OLD.currency,OLD.created_at) then
      return null;
    end if;
    if NEW.public_token is distinct from OLD.public_token then
      tokens := array[OLD.public_token,NEW.public_token];
    else
      tokens := array[NEW.public_token];
    end if;
  else
    tokens := array[OLD.public_token];
  end if;
  foreach token in array tokens loop
    if token is null or token = '' then continue; end if;
    topic := 'order-status:' || pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to('quickserve:order:' || token,'UTF8')),'hex');
    begin
      perform realtime.send(pg_catalog.jsonb_build_object('refresh',true),'order_changed',topic,false);
    exception when others then
      -- Socket delivery must never prevent kitchen/payment/order writes.
      -- Log no customer data, tokens or topic names.
      raise log 'quickserve_order_realtime_delivery_failed SQLSTATE %', SQLSTATE;
    end;
  end loop;
  return null;
end
$function$;
revoke all on function app.notify_public_order_change() from public,anon,authenticated;

drop trigger if exists trg_public_order_realtime_hint on public.orders;
create trigger trg_public_order_realtime_hint
  after update or delete on public.orders
  for each row execute function app.notify_public_order_change();
