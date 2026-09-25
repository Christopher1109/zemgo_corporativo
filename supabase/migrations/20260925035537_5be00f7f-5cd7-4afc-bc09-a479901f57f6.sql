ALTER TABLE public.sales_reps ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_reps_user_id_uniq ON public.sales_reps(user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_sales_rep_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.sales_reps WHERE user_id = auth.uid() AND is_active LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_my_client(_client_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.current_sales_rep_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients WHERE id=_client_id AND sales_rep_id = public.current_sales_rep_id()) $$;
CREATE OR REPLACE FUNCTION public.is_my_policy(_policy_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.current_sales_rep_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.policies WHERE id=_policy_id AND sales_rep_id = public.current_sales_rep_id()) $$;
CREATE OR REPLACE FUNCTION public.is_my_program(_program_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.current_sales_rep_id() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.sales_reps WHERE id=public.current_sales_rep_id() AND program_id=_program_id)
    OR EXISTS (SELECT 1 FROM public.policies WHERE program_id=_program_id AND sales_rep_id=public.current_sales_rep_id())) $$;
CREATE OR REPLACE FUNCTION public.is_sales_rep_only() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sales_reps WHERE user_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.user_program_access WHERE user_id = auth.uid())
    AND NOT COALESCE(public.is_super_admin(auth.uid()), false) $$;

CREATE POLICY "Sales rep reads own row" ON public.sales_reps FOR SELECT TO authenticated USING (id = public.current_sales_rep_id());
CREATE POLICY "Sales rep reads own clients" ON public.clients FOR SELECT TO authenticated USING (sales_rep_id IS NOT NULL AND sales_rep_id = public.current_sales_rep_id());
CREATE POLICY "Sales rep reads own client_programs" ON public.client_programs FOR SELECT TO authenticated USING (public.is_my_client(client_id));
CREATE POLICY "Sales rep reads own policies" ON public.policies FOR SELECT TO authenticated USING (sales_rep_id IS NOT NULL AND sales_rep_id = public.current_sales_rep_id());
CREATE POLICY "Sales rep reads own payments" ON public.payments FOR SELECT TO authenticated USING (public.is_my_policy(policy_id));
CREATE POLICY "Sales rep reads own commissions" ON public.sales_commissions FOR SELECT TO authenticated USING (sales_rep_id = public.current_sales_rep_id());
CREATE POLICY "Sales rep reads own programs" ON public.programs FOR SELECT TO authenticated USING (public.is_my_program(id));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['clients','client_programs','policies','payments','sales_reps','sales_commissions'] LOOP
    EXECUTE format('CREATE POLICY "No sales rep insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_sales_rep_only())', t);
    EXECUTE format('CREATE POLICY "No sales rep update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_sales_rep_only()) WITH CHECK (NOT public.is_sales_rep_only())', t);
    EXECUTE format('CREATE POLICY "No sales rep delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_sales_rep_only())', t);
  END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.resolve_sales_rep_ref(_ref text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _v text; _slug text; _norm text; _id uuid;
BEGIN
  _v := nullif(btrim(coalesce(_ref,'')),'');
  IF _v IS NULL THEN RETURN NULL; END IF;
  IF _v ~* '[?&]ref=' THEN
    _v := nullif(btrim(public.unaccent(replace((regexp_match(_v, '[?&]ref=([^&#]*)', 'i'))[1], '+', ' '))), '');
    IF _v IS NULL THEN RETURN NULL; END IF;
  END IF;
  _slug := public.sales_rep_slug(_v);
  _norm := regexp_replace(lower(public.unaccent(_v)), '\s+', ' ', 'g');
  SELECT id INTO _id FROM public.sales_reps WHERE is_active AND (
      (ref_slug IS NOT NULL AND lower(ref_slug) = _slug)
      OR (code IS NOT NULL AND lower(code) = lower(_v)))
  LIMIT 1;
  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.sales_reps WHERE is_active AND (
      regexp_replace(lower(public.unaccent(full_name)), '\s+', ' ', 'g') = _norm
      OR public.sales_rep_slug(full_name) = _slug) LIMIT 1;
  END IF;
  RETURN _id;
END $$;

DROP FUNCTION IF EXISTS public.upsert_sales_rep_by_name(text);
CREATE OR REPLACE FUNCTION public.upsert_sales_rep_by_name(_name text, _client_id uuid DEFAULT NULL::uuid, _source text DEFAULT 'sheet_sync'::text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.resolve_sales_rep_ref(_name) $$;

CREATE OR REPLACE FUNCTION public.policy_inherit_sales_rep() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.sales_rep_id IS NULL THEN
    SELECT c.sales_rep_id INTO NEW.sales_rep_id FROM public.clients c
      JOIN public.sales_reps r ON r.id = c.sales_rep_id AND r.is_active
      WHERE c.id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.backfill_commissions_on_assign() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.sales_rep_id IS NULL AND NEW.sales_rep_id IS NOT NULL THEN
    INSERT INTO public.sales_commissions(sales_rep_id, payment_id, policy_id, client_id, program_id, kind, percentage, base_amount, amount, earned_at, period)
    SELECT NEW.sales_rep_id, x.id, NEW.id, NEW.client_id, NEW.program_id,
      CASE WHEN x.rn = 1 THEN 'new' ELSE 'renewal' END,
      CASE WHEN x.rn = 1 THEN 20 ELSE 10 END,
      x.base, round(x.base * (CASE WHEN x.rn = 1 THEN 20 ELSE 10 END) / 100.0, 2),
      COALESCE(x.paid_at, now()), date_trunc('month', COALESCE(x.paid_at, now()))::date
    FROM (SELECT p.id, p.paid_at, COALESCE(p.paid_amount, p.amount, 0) AS base,
            row_number() OVER (ORDER BY COALESCE(p.paid_at, p.created_at)) AS rn
          FROM public.payments p WHERE p.policy_id = NEW.id AND p.status = 'paid') x
    ON CONFLICT (payment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_backfill_commissions_on_assign ON public.policies;
CREATE TRIGGER trg_backfill_commissions_on_assign AFTER UPDATE OF sales_rep_id ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.backfill_commissions_on_assign();

INSERT INTO public.system_config(key, value, description)
VALUES ('sales_reps.form_base_url', to_jsonb(''::text), 'URL base del formulario de registro; liga = <url>?ref=<ref_slug>')
ON CONFLICT (key) DO NOTHING;