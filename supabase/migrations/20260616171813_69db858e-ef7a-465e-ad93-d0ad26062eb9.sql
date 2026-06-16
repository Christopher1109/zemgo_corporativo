
-- 1) Extend enum
ALTER TYPE public.incident_status ADD VALUE IF NOT EXISTS 'pass_expired';

-- 2) profiles: signature_url
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature_url text;

-- 3) incidents: extra columns
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS accident_date date,
  ADD COLUMN IF NOT EXISTS accident_time time,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz NOT NULL DEFAULT now();

-- 4) medical_passes: extra columns
ALTER TABLE public.medical_passes
  ADD COLUMN IF NOT EXISTS director_name text,
  ADD COLUMN IF NOT EXISTS director_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revocation_reason text;

CREATE INDEX IF NOT EXISTS idx_incidents_policy ON public.incidents(policy_id);
CREATE INDEX IF NOT EXISTS idx_incidents_client ON public.incidents(client_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status_reported ON public.incidents(status, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_passes_incident ON public.medical_passes(incident_id);
CREATE INDEX IF NOT EXISTS idx_passes_valid_until ON public.medical_passes(valid_until);

-- 5) RPCs

CREATE OR REPLACE FUNCTION public.report_incident(
  _policy_id uuid,
  _accident_date date,
  _accident_time time,
  _location text,
  _description text,
  _hospital text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_policy public.policies;
  v_incident_id uuid;
  v_occurred timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = _policy_id;
  IF v_policy.id IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  IF v_policy.status <> 'active' THEN RAISE EXCEPTION 'policy_not_active'; END IF;
  IF NOT public.has_program_role(v_user, v_policy.program_id,
      ARRAY['admin','manager','operator','claims']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _accident_date IS NULL THEN RAISE EXCEPTION 'accident_date_required'; END IF;
  IF _accident_date > CURRENT_DATE THEN RAISE EXCEPTION 'accident_date_cannot_be_future'; END IF;
  IF v_policy.start_date IS NOT NULL AND _accident_date < v_policy.start_date THEN
    RAISE EXCEPTION 'accident_before_policy_start';
  END IF;
  IF _description IS NULL OR length(trim(_description)) < 20 THEN
    RAISE EXCEPTION 'description_too_short';
  END IF;

  v_occurred := (_accident_date::text || ' ' || COALESCE(_accident_time::text, '00:00:00'))::timestamptz;

  INSERT INTO public.incidents(
    policy_id, client_id, occurred_at, accident_date, accident_time,
    location_description, hospital, description, status, reported_at, created_by
  ) VALUES (
    _policy_id, v_policy.client_id, v_occurred, _accident_date, _accident_time,
    _location, _hospital, _description, 'reported', now(), v_user
  ) RETURNING id INTO v_incident_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'incident', v_incident_id, 'INCIDENT_REPORTED',
    jsonb_build_object('hospital', _hospital, 'accident_date', _accident_date));

  RETURN v_incident_id;
END $$;

CREATE OR REPLACE FUNCTION public.reject_incident(
  _incident_id uuid, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inc public.incidents;
  v_policy public.policies;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_inc FROM public.incidents WHERE id = _incident_id FOR UPDATE;
  IF v_inc.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_inc.policy_id;
  IF NOT public.has_program_role(v_user, v_policy.program_id,
      ARRAY['admin','manager','claims']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_inc.status NOT IN ('reported','pending_review') THEN
    RAISE EXCEPTION 'invalid_state';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 30 THEN
    RAISE EXCEPTION 'reason_too_short';
  END IF;

  UPDATE public.incidents SET
    status='rejected', rejected_at=now(), rejected_by=v_user,
    rejection_reason=_reason, updated_at=now()
  WHERE id = _incident_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'incident', _incident_id, 'INCIDENT_REJECTED',
    jsonb_build_object('reason', _reason));

  INSERT INTO public.notifications(channel, recipient, template_code, payload, status)
  VALUES ('in_app', v_inc.client_id::text, 'INCIDENT_REJECTED',
    jsonb_build_object('incident_id', _incident_id, 'reason', _reason), 'pending');
END $$;

CREATE OR REPLACE FUNCTION public.issue_medical_pass(
  _incident_id uuid, _director_id uuid, _hospital text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inc public.incidents;
  v_policy public.policies;
  v_client public.clients;
  v_program public.programs;
  v_director public.profiles;
  v_pass_id uuid;
  v_snapshot jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_inc FROM public.incidents WHERE id = _incident_id FOR UPDATE;
  IF v_inc.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_inc.policy_id;
  SELECT * INTO v_client FROM public.clients WHERE id = v_inc.client_id;
  SELECT * INTO v_program FROM public.programs WHERE id = v_policy.program_id;

  IF NOT public.has_program_role(v_user, v_policy.program_id,
      ARRAY['admin','manager','claims']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_inc.status NOT IN ('reported','pending_review') THEN
    RAISE EXCEPTION 'invalid_state:%', v_inc.status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.medical_passes
    WHERE incident_id = _incident_id AND revoked_at IS NULL AND valid_until > now()
  ) THEN
    RAISE EXCEPTION 'active_pass_exists';
  END IF;

  SELECT * INTO v_director FROM public.profiles WHERE id = _director_id;
  IF v_director.id IS NULL THEN RAISE EXCEPTION 'director_not_found'; END IF;
  IF NOT public.has_program_role(_director_id, v_policy.program_id,
      ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'director_not_authorized';
  END IF;

  v_snapshot := jsonb_build_object(
    'contracting_party', v_policy.contracting_party,
    'policy_number', v_policy.policy_number,
    'certificate_number', v_policy.certificate_number,
    'folio', v_policy.folio,
    'program_code', v_program.code,
    'program_name', v_program.name,
    'insured_name', trim(coalesce(v_client.first_name,'') || ' ' ||
                          coalesce(v_client.middle_name,'') || ' ' ||
                          coalesce(v_client.last_name,'')),
    'insured_dob', v_client.date_of_birth,
    'insured_curp', v_client.curp,
    'sum_insured', v_policy.sum_insured,
    'deductible', v_policy.deductible,
    'accident_date', v_inc.accident_date,
    'accident_time', v_inc.accident_time,
    'accident_description', v_inc.description,
    'hospital', COALESCE(_hospital, v_inc.hospital),
    'policy_valid_from', v_policy.start_date,
    'policy_valid_until', v_policy.end_date
  );

  INSERT INTO public.medical_passes(
    incident_id, policy_id, snapshot, valid_from, valid_until,
    director_signature_url, director_name, director_id, issued_by, created_by
  ) VALUES (
    _incident_id, v_policy.id, v_snapshot, now(), now() + INTERVAL '48 hours',
    v_director.signature_url, v_director.full_name, _director_id, v_user, v_user
  ) RETURNING id INTO v_pass_id;

  IF _hospital IS NOT NULL AND _hospital <> v_inc.hospital THEN
    UPDATE public.incidents SET hospital = _hospital WHERE id = _incident_id;
  END IF;
  UPDATE public.incidents SET
    status='pass_issued', approved_at=now(), approved_by=v_user, updated_at=now()
  WHERE id = _incident_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'incident', _incident_id, 'PASS_ISSUED',
    jsonb_build_object('pass_id', v_pass_id, 'director_id', _director_id,
                       'valid_until', (now() + INTERVAL '48 hours')));

  RETURN v_pass_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_medical_pass(
  _pass_id uuid, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pass public.medical_passes;
  v_policy public.policies;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_pass FROM public.medical_passes WHERE id = _pass_id FOR UPDATE;
  IF v_pass.id IS NULL THEN RAISE EXCEPTION 'pass_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_pass.policy_id;
  IF NOT public.has_program_role(v_user, v_policy.program_id,
      ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_pass.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'already_revoked'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE public.medical_passes SET
    revoked_at=now(), revoked_by=v_user, revocation_reason=_reason
  WHERE id = _pass_id;

  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'medical_pass', _pass_id, 'PASS_REVOKED',
    jsonb_build_object('reason', _reason, 'incident_id', v_pass.incident_id));
END $$;

CREATE OR REPLACE FUNCTION public.set_medical_pass_pdf_url(
  _pass_id uuid, _pdf_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pass public.medical_passes;
  v_policy public.policies;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO v_pass FROM public.medical_passes WHERE id = _pass_id;
  IF v_pass.id IS NULL THEN RAISE EXCEPTION 'pass_not_found'; END IF;
  SELECT * INTO v_policy FROM public.policies WHERE id = v_pass.policy_id;
  IF NOT public.has_program_role(v_user, v_policy.program_id,
      ARRAY['admin','manager','claims']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.medical_passes SET pdf_url = _pdf_url WHERE id = _pass_id;
  INSERT INTO public.audit_log(user_id, program_id, entity_type, entity_id, action, diff)
  VALUES (v_user, v_policy.program_id, 'medical_pass', _pass_id, 'PASS_PDF_GENERATED',
    jsonb_build_object('pdf_url', _pdf_url));
END $$;

CREATE OR REPLACE FUNCTION public.run_pass_expiration_check()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expired int := 0; r record;
BEGIN
  FOR r IN
    SELECT i.id, p.program_id
    FROM public.incidents i
    JOIN public.policies p ON p.id = i.policy_id
    WHERE i.status = 'pass_issued'
      AND NOT EXISTS (
        SELECT 1 FROM public.medical_passes mp
        WHERE mp.incident_id = i.id
          AND mp.revoked_at IS NULL
          AND mp.valid_until > now()
      )
      AND EXISTS (
        SELECT 1 FROM public.medical_passes mp2
        WHERE mp2.incident_id = i.id
      )
  LOOP
    UPDATE public.incidents SET status='pass_expired', updated_at=now()
    WHERE id = r.id;
    INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
    VALUES (r.program_id, 'incident', r.id, 'PASS_AUTO_EXPIRED',
      jsonb_build_object('expired_at', now()));
    v_expired := v_expired + 1;
  END LOOP;
  RETURN jsonb_build_object('expired', v_expired);
END $$;

-- 6) Storage policies for medical-passes bucket
DROP POLICY IF EXISTS "medical_passes_read" ON storage.objects;
CREATE POLICY "medical_passes_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'medical-passes' AND EXISTS (
    SELECT 1 FROM public.medical_passes mp
    JOIN public.policies p ON p.id = mp.policy_id
    WHERE p.id = mp.policy_id
      AND has_program_access(auth.uid(), p.program_id)
      AND storage.objects.name LIKE '%/' || mp.id::text || '.pdf'
  )
);

DROP POLICY IF EXISTS "medical_passes_insert" ON storage.objects;
CREATE POLICY "medical_passes_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'medical-passes' AND EXISTS (
    SELECT 1 FROM public.medical_passes mp
    JOIN public.policies p ON p.id = mp.policy_id
    WHERE has_program_role(auth.uid(), p.program_id,
      ARRAY['admin','manager','claims']::app_role[])
      AND storage.objects.name LIKE '%/' || mp.id::text || '.pdf'
  )
);

-- 7) Schedule cron job for pass expiration
SELECT cron.schedule(
  'pass-expiration-check',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4f47a57f-df35-4c42-bc69-15a3f5f0d29c.lovable.app/api/public/hooks/pass-expiration',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJua2lsZW5sdXh5ZW5jcXdlZ2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTAyNDQsImV4cCI6MjA5NzE4NjI0NH0.EP-4jRvx-YSgWWLOw6C_chBtLSFKhLMGPeehh4WnKeg'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
