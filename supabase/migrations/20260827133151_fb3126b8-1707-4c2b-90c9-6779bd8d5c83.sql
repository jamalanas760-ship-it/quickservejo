REVOKE ALL ON FUNCTION public.guard_seat_limit_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_seat_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restaurant_seat_limit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_seats_used(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_seat_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_seats_used(uuid) TO authenticated;