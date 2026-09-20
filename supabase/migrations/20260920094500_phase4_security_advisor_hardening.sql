alter table public.public_rate_limits enable row level security;
revoke all on public.public_rate_limits from anon,authenticated;

revoke execute on function public.create_restaurant_with_setup(jsonb,integer) from anon;
revoke execute on function public.erp_post_receipt_expense() from anon,authenticated;
revoke execute on function public.set_table_service_status(uuid,text) from anon;
revoke execute on function public.sync_booking_table_status() from anon,authenticated;
revoke execute on function public.touch_my_presence(uuid) from anon;
revoke execute on function public.update_own_cover(uuid,text,numeric,numeric,numeric) from anon;
revoke execute on function public.update_own_display_name(uuid,text) from anon;
revoke execute on function public.update_own_shift_assignment_status(uuid,text) from anon;

grant execute on function public.create_restaurant_with_setup(jsonb,integer) to authenticated;
grant execute on function public.set_table_service_status(uuid,text) to authenticated;
grant execute on function public.touch_my_presence(uuid) to authenticated;
grant execute on function public.update_own_cover(uuid,text,numeric,numeric,numeric) to authenticated;
grant execute on function public.update_own_display_name(uuid,text) to authenticated;
grant execute on function public.update_own_shift_assignment_status(uuid,text) to authenticated;
