-- RLS still determines which row changes each client may receive.
do $$
declare _name text;
begin
  foreach _name in array array['restaurant_tables','payment_transactions','table_bookings','booking_waitlist'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=_name) then
      execute format('alter publication supabase_realtime add table public.%I',_name);
    end if;
  end loop;
end;
$$;
