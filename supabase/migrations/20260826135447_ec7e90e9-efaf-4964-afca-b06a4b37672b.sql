REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_platform_ownership(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_platform_ownership(text) TO authenticated;