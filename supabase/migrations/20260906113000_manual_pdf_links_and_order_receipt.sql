-- Manual PDF hotspots are the only clickable PDF menu links going forward.
-- Existing AI/extraction links are disabled without deleting the underlying menu items.
UPDATE public.menu_pdf_item_links
SET is_active = false
WHERE is_active = true
  AND (candidate_id IS NULL OR candidate_id NOT LIKE 'manual-%');

-- Public, read-only receipt data for the customer order tracking page.
-- The public token is the only lookup key exposed to diners.
CREATE OR REPLACE FUNCTION public.public_order_receipt(_public_token text)
RETURNS TABLE (
  order_number text,
  status public.order_status,
  payment_status public.payment_status,
  subtotal numeric,
  tax_amount numeric,
  service_amount numeric,
  discount_amount numeric,
  total numeric,
  currency text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.order_number,
    o.status,
    o.payment_status,
    o.subtotal,
    o.tax_amount,
    o.service_amount,
    o.discount_amount,
    o.total,
    o.currency,
    o.created_at
  FROM public.orders o
  WHERE o.public_token = _public_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_order_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_order_receipt(text) TO anon, authenticated;
