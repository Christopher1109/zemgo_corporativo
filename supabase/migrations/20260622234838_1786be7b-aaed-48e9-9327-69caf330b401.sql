
-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. sales_reps additions
ALTER TABLE public.sales_reps 
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS created_by_sheet_sync boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS sales_reps_code_unique ON public.sales_reps(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_reps_full_name_lower ON public.sales_reps(lower(full_name));

-- 3. clients additions
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS address_full text,
  ADD COLUMN IF NOT EXISTS phone_alt text;

-- 4. Repoint clients.sales_rep_id FK to sales_reps
-- Existing 62 rows point to auth.users (seed). Null them out before repointing.
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_sales_rep_id_fkey;
UPDATE public.clients
  SET sales_rep_id = NULL
  WHERE sales_rep_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.sales_reps s WHERE s.id = clients.sales_rep_id);
ALTER TABLE public.clients
  ADD CONSTRAINT clients_sales_rep_id_fkey
  FOREIGN KEY (sales_rep_id) REFERENCES public.sales_reps(id) ON DELETE SET NULL;

-- 5. sheet_sync_log additions
ALTER TABLE public.sheet_sync_log
  ADD COLUMN IF NOT EXISTS sheet_program text,
  ADD COLUMN IF NOT EXISTS rows_new int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_updated int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_failed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms int,
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS sheet_sync_log_started_at ON public.sheet_sync_log(started_at DESC);

DROP POLICY IF EXISTS "deny_all_ssl" ON public.sheet_sync_log;
CREATE POLICY "sheet_sync_log_super_admin"
  ON public.sheet_sync_log FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.sheet_sync_log TO authenticated;
GRANT ALL ON public.sheet_sync_log TO service_role;

-- 6. sheet_synced_rows
CREATE TABLE IF NOT EXISTS public.sheet_synced_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id varchar(100) NOT NULL,
  sheet_program varchar(20) NOT NULL,
  row_number int NOT NULL,
  row_hash varchar(64) NOT NULL,
  folio varchar(50),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  policy_id uuid REFERENCES public.policies(id) ON DELETE SET NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  status varchar(20) NOT NULL DEFAULT 'synced',
  error_message text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sheet_synced_rows_sheet_row ON public.sheet_synced_rows(sheet_id, row_number);
CREATE INDEX IF NOT EXISTS sheet_synced_rows_status ON public.sheet_synced_rows(status);
CREATE INDEX IF NOT EXISTS sheet_synced_rows_folio ON public.sheet_synced_rows(folio);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_synced_rows TO authenticated;
GRANT ALL ON public.sheet_synced_rows TO service_role;

ALTER TABLE public.sheet_synced_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sheet_synced_rows_super_admin"
  ON public.sheet_synced_rows FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_sheet_synced_rows_touch
  BEFORE UPDATE ON public.sheet_synced_rows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Encryption key storage (service_role only)
CREATE TABLE IF NOT EXISTS public._secret_keys (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._secret_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._secret_keys FROM authenticated, anon, PUBLIC;
GRANT ALL ON public._secret_keys TO service_role;

INSERT INTO public._secret_keys (name, value)
VALUES ('google_sheets_encryption_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- 8. Security definer RPCs
CREATE OR REPLACE FUNCTION public.save_google_sheets_credentials(_json jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _encrypted text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super-admin requerido';
  END IF;
  IF _json IS NULL OR _json->>'client_email' IS NULL OR _json->>'private_key' IS NULL THEN
    RAISE EXCEPTION 'invalid_json: faltan campos client_email o private_key';
  END IF;
  SELECT value INTO _key FROM public._secret_keys WHERE name = 'google_sheets_encryption_key';
  _encrypted := encode(pgp_sym_encrypt(_json::text, _key), 'base64');
  INSERT INTO public.system_config (key, value)
  VALUES ('google_sheets.service_account_key',
          jsonb_build_object(
            'encrypted', _encrypted,
            'client_email', _json->>'client_email',
            'project_id', _json->>'project_id',
            'updated_at', now()
          ))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_google_sheets_credentials()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _encrypted text;
  _decrypted text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT value INTO _key FROM public._secret_keys WHERE name = 'google_sheets_encryption_key';
  SELECT value->>'encrypted' INTO _encrypted FROM public.system_config WHERE key = 'google_sheets.service_account_key';
  IF _encrypted IS NULL THEN
    RETURN NULL;
  END IF;
  _decrypted := pgp_sym_decrypt(decode(_encrypted, 'base64'), _key);
  RETURN _decrypted::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_google_sheets_credentials_meta()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'configured', value IS NOT NULL,
    'client_email', value->>'client_email',
    'project_id', value->>'project_id',
    'updated_at', value->>'updated_at'
  )
  FROM public.system_config
  WHERE key = 'google_sheets.service_account_key';
$$;

REVOKE ALL ON FUNCTION public.save_google_sheets_credentials(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_google_sheets_credentials() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_google_sheets_credentials_meta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_google_sheets_credentials(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_google_sheets_credentials() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_google_sheets_credentials_meta() TO authenticated, service_role;

-- 9. Seed default config
INSERT INTO public.system_config (key, value, description) VALUES
  ('google_sheets.enabled', 'false'::jsonb, 'Auto-sync cron toggle'),
  ('google_sheets.sheets', '[
    {"program": "ABC", "sheet_id": "19oA3Cye9hNt0lQdcy-GVxacaQxFMT2X1omPmu23vGus", "tab": "REGISTRO PARA CERTIFICADO"},
    {"program": "FUTCARE", "sheet_id": "1ideFFLMEiOVCVgDGuLWmo631J8jGsDY0ezCiBXbzqzY", "tab": "REGISTRO PARA CERTIFICADO"},
    {"program": "MCV", "sheet_id": "1Szd6k6SaDi5Af60jqarJrSflrvxEEPKqYJhs9ql48j8", "tab": "REGISTRO PARA CERTIFICADO"}
  ]'::jsonb, 'Configured Google Sheets per program')
ON CONFLICT (key) DO NOTHING;
