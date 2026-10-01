-- Existing installations may have the compatibility version of this table.
-- CREATE TABLE IF NOT EXISTS never adds missing columns to that version.
alter table public.order_status_events
  add column if not exists actor_role public.app_role;

-- Keep direct staff updates restricted while allowing validated server-side
-- checkout routines to calculate totals and attach optional guest details.
create or replace function app.guard_order_capability_updates()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  _can_status boolean;
  _can_payment boolean;
  _allowed text[] := array['updated_at'];
begin
  -- Check the effective SQL caller, not the guest JWT. Validated checkout and
  -- payment RPCs execute their internal writes as their trusted function owner.
  -- SECURITY INVOKER is essential: SECURITY DEFINER would make every caller
  -- appear to be postgres and silently disable the staff field restrictions.
  if current_user in ('postgres','service_role','supabase_admin') then
    return new;
  end if;

  if app.is_super_admin() or app.has_capability(old.restaurant_id,'manage_restaurant') then
    return new;
  end if;

  _can_status := app.has_capability(old.restaurant_id,'update_order_status');
  _can_payment := app.has_capability(old.restaurant_id,'manage_payments');

  if not _can_status and not _can_payment then
    raise exception 'You do not have permission to update this order'
      using errcode='42501';
  end if;

  if _can_status then
    _allowed := _allowed || array[
      'status','assigned_staff_id','assigned_at',
      'cancellation_reason','cancellation_note','cancelled_at','cancelled_by'
    ];
  end if;

  if _can_payment then
    _allowed := _allowed || array['payment_status'];
    if (old.status='served' and new.status='paid')
       or (old.status='paid' and new.status='served') then
      _allowed := _allowed || array['status'];
    end if;
  end if;

  if (to_jsonb(new) - _allowed) is distinct from (to_jsonb(old) - _allowed) then
    raise exception 'This role may only update permitted order fields'
      using errcode='42501';
  end if;

  if new.status is distinct from old.status then
    if _can_status then
      null;
    elsif _can_payment and (
      (old.status='served' and new.status='paid')
      or (old.status='paid' and new.status='served')
    ) then
      null;
    else
      raise exception 'You do not have permission to change order status'
        using errcode='42501';
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status and not _can_payment then
    raise exception 'You do not have permission to change payment status'
      using errcode='42501';
  end if;

  return new;
end;
$$;


notify pgrst,'reload schema';
