-- Metadata-only cleanup: retain equivalent migration-defined indexes and all data.
-- Acquire all table locks immediately or abort; never queue behind active work.
set local lock_timeout = '100ms';
set local statement_timeout = '2s';

do $cleanup$
declare
  pair record;
  kept pg_catalog.pg_index%rowtype;
  redundant pg_catalog.pg_index%rowtype;
  kept_relation pg_catalog.pg_class%rowtype;
  redundant_relation pg_catalog.pg_class%rowtype;
  pairs constant jsonb := '[
    {"table":"order_status_events","keep":"order_status_events_order_idx","drop":"order_status_events_order_created_idx"},
    {"table":"order_status_events","keep":"order_status_events_restaurant_idx","drop":"order_status_events_restaurant_created_idx"},
    {"table":"orders","keep":"orders_restaurant_created_idx","drop":"idx_orders_created_at"},
    {"table":"staff_time_entries","keep":"staff_time_entries_one_open_per_staff_idx","drop":"staff_time_entries_one_open_idx"}
  ]';
begin
  lock table public.order_status_events, public.orders, public.staff_time_entries
    in access exclusive mode nowait;

  -- Validate every pair before dropping the first object. Fail closed on drift.
  for pair in select * from jsonb_to_recordset(pairs) as p("table" text, keep text, "drop" text)
  loop
    select * into kept from pg_catalog.pg_index
      where indexrelid = to_regclass(format('public.%I', pair.keep));
    if not found then
      raise exception 'Required retained index missing: %', pair.keep;
    end if;
    select * into kept_relation from pg_catalog.pg_class where oid = kept.indexrelid;
    if kept.indrelid <> to_regclass(format('public.%I', pair."table"))
       or kept_relation.relkind <> 'i'
       or not (kept.indisvalid and kept.indisready and kept.indislive)
       or kept.indcheckxmin then
      raise exception 'Retained index is not a ready equivalent: %', pair.keep;
    end if;

    select * into redundant from pg_catalog.pg_index
      where indexrelid = to_regclass(format('public.%I', pair."drop"));
    -- Already-clean environments are valid, provided the retained index is healthy.
    if not found then continue; end if;
    select * into redundant_relation from pg_catalog.pg_class where oid = redundant.indexrelid;

    if redundant_relation.relkind <> 'i'
       or not (redundant.indisvalid and redundant.indisready and redundant.indislive)
       or redundant.indcheckxmin
       or redundant.indisprimary or redundant.indisexclusion
       or redundant.indisreplident or redundant.indisclustered then
      raise exception 'Redundant index has a protected or invalid state: %', pair."drop";
    end if;
    -- Includes column order, INCLUDE columns, uniqueness/null semantics, operator
    -- classes, collation, ordering/null placement, expression and partial predicate.
    if (to_jsonb(kept) - array['indexrelid','indisprimary','indisclustered','indisreplident'])
       is distinct from
       (to_jsonb(redundant) - array['indexrelid','indisprimary','indisclustered','indisreplident'])
       or kept_relation.relam <> redundant_relation.relam
       or kept_relation.reltablespace <> redundant_relation.reltablespace
       or kept_relation.reloptions is distinct from redundant_relation.reloptions then
      raise exception 'Index definitions differ: % and %', pair.keep, pair."drop";
    end if;
    if exists (select 1 from pg_catalog.pg_constraint where conindid = redundant.indexrelid)
       or exists (select 1 from pg_catalog.pg_depend
          where refclassid = 'pg_catalog.pg_class'::regclass and refobjid = redundant.indexrelid)
       or exists (select 1 from pg_catalog.pg_depend
          where classid = 'pg_catalog.pg_class'::regclass and objid = redundant.indexrelid
            and deptype in ('e','x','i','P','S')) then
      raise exception 'Index has a constraint, extension or dependent object: %', pair."drop";
    end if;
  end loop;

  for pair in select * from jsonb_to_recordset(pairs) as p("table" text, keep text, "drop" text)
  loop
    execute format('drop index if exists public.%I restrict', pair."drop");
  end loop;
end
$cleanup$;
