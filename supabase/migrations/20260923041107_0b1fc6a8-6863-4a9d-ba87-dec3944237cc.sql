UPDATE public.policies p
SET sales_rep_id = c.sales_rep_id
FROM public.clients c
WHERE c.id = p.client_id
  AND p.sales_rep_id IS NULL
  AND c.sales_rep_id IS NOT NULL;