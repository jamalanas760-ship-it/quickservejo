begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Preserve existing constraint names: duplicate parallel foreign keys would make
-- PostgREST embedded joins ambiguous. All changes roll back on dirty data/locks.
do $$
declare f record; mismatches bigint; delete_rule text; update_rule text;
begin
  for f in
    select c.conname, c.conrelid, c.confrelid, c.confdeltype, c.confupdtype,
      c.condeferrable, c.condeferred, child.relname child_table, parent.relname parent_table,
      ca.attname child_column, pa.attname parent_column
    from pg_constraint c
    join pg_class child on child.oid=c.conrelid
    join pg_class parent on parent.oid=c.confrelid
    join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=c.conkey[1]
    join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
    where c.contype='f' and child.relnamespace='public'::regnamespace
      and parent.relnamespace='public'::regnamespace and array_length(c.conkey,1)=1
      and ca.attname<>'restaurant_id'
      and exists(select 1 from pg_attribute a where a.attrelid=c.conrelid and a.attname='restaurant_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.confrelid and a.attname='restaurant_id' and not a.attisdropped)
    order by child.relname,c.conname
  loop
    execute format('select count(*) from public.%I c join public.%I p on c.%I=p.%I where c.restaurant_id is distinct from p.restaurant_id',f.child_table,f.parent_table,f.child_column,f.parent_column) into mismatches;
    if mismatches>0 then raise exception 'Tenant mismatch in %.% (% rows). No automatic data repair performed.',f.child_table,f.child_column,mismatches; end if;
    if f.confupdtype not in ('a','r','c') or f.confdeltype not in ('a','r','c','n') then
      raise exception 'Review nonstandard FK action before migrating %',f.conname;
    end if;
    execute format('create unique index if not exists %I on public.%I (%I,restaurant_id)',
      'qs_tenant_'||substr(md5(f.parent_table||':'||f.parent_column),1,16)||'_uq',f.parent_table,f.parent_column);
    delete_rule := case f.confdeltype when 'c' then 'cascade' when 'r' then 'restrict' when 'n' then format('set null (%I)',f.child_column) else 'no action' end;
    update_rule := case f.confupdtype when 'c' then 'cascade' when 'r' then 'restrict' else 'no action' end;
    execute format('alter table public.%I drop constraint %I',f.child_table,f.conname);
    execute format('alter table public.%I add constraint %I foreign key (%I,restaurant_id) references public.%I (%I,restaurant_id) on delete %s on update %s %s %s not valid',
      f.child_table,f.conname,f.child_column,f.parent_table,f.parent_column,delete_rule,update_rule,
      case when f.condeferrable then 'deferrable' else 'not deferrable' end,
      case when f.condeferred then 'initially deferred' else 'initially immediate' end);
    execute format('alter table public.%I validate constraint %I',f.child_table,f.conname);
  end loop;
end $$;
commit;
