CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.save_google_sheets_credentials(_json jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  _encrypted := encode(extensions.pgp_sym_encrypt(_json::text, _key), 'base64');
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
$function$;

CREATE OR REPLACE FUNCTION public.get_google_sheets_credentials()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  _decrypted := extensions.pgp_sym_decrypt(decode(_encrypted, 'base64'), _key);
  RETURN _decrypted::jsonb;
END;
$function$;