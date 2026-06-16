
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','manager','operator','claims','sales','viewer');
CREATE TYPE public.client_program_status AS ENUM ('prospect','active','inactive','cancelled');
CREATE TYPE public.policy_status AS ENUM ('draft','pending_payment','active','expired','cancelled','suspended');
CREATE TYPE public.payment_frequency AS ENUM ('monthly','yearly','one_time');
CREATE TYPE public.payment_method AS ENUM ('bank_reference','bank_transfer','cash','card','oxxo','manual');
CREATE TYPE public.payment_status AS ENUM ('pending','processing','paid','failed','refunded','cancelled','overdue');
CREATE TYPE public.incident_status AS ENUM ('reported','pending_review','pass_issued','in_treatment','closed','rejected');
CREATE TYPE public.document_owner_type AS ENUM ('client','policy','incident');
CREATE TYPE public.notification_channel AS ENUM ('email','whatsapp','sms','in_app');

-- ============ TABLES (no policies yet) ============
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL, insurance_branch text NOT NULL,
  color_primary text NOT NULL, color_secondary text NOT NULL, color_accent text NOT NULL,
  billing_note text, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text, phone text, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.roles (
  code public.app_role PRIMARY KEY, name text NOT NULL, description text
);

CREATE TABLE public.user_program_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, program_id)
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL, last_name text NOT NULL,
  curp text UNIQUE NOT NULL, rfc text,
  date_of_birth date, gender text, marital_status text,
  email text, phone text,
  street text, number text, colonia text, city text, state text, zip text,
  referral_source_id uuid,
  sales_rep_id uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.client_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  status public.client_program_status NOT NULL DEFAULT 'prospect',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, program_id)
);

CREATE TABLE public.program_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  code text NOT NULL, description text NOT NULL,
  sum_insured numeric(14,2), is_included boolean NOT NULL DEFAULT false,
  note text, display_order int NOT NULL DEFAULT 0,
  UNIQUE (program_id, code)
);

CREATE TABLE public.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text UNIQUE NOT NULL, policy_number text, certificate_number text,
  program_id uuid NOT NULL REFERENCES public.programs(id),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  issue_date date, start_date date, end_date date,
  sum_insured numeric(14,2), deductible numeric(14,2), premium numeric(14,2),
  status public.policy_status NOT NULL DEFAULT 'draft',
  contracting_party text, certificate_pdf_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  full_name text NOT NULL, relationship text, percentage numeric(5,2),
  display_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  full_name text NOT NULL, relationship text, date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  is_recurring boolean NOT NULL DEFAULT true,
  frequency public.payment_frequency NOT NULL DEFAULT 'monthly',
  amount numeric(14,2) NOT NULL, next_due_date date,
  auto_charge boolean NOT NULL DEFAULT false,
  reminder_days_before int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL, due_date date, paid_at timestamptz,
  method public.payment_method,
  status public.payment_status NOT NULL DEFAULT 'pending',
  bank_reference text, provider text, provider_transaction_id text,
  reconciled boolean NOT NULL DEFAULT false, failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL, location_description text, hospital text,
  description text,
  status public.incident_status NOT NULL DEFAULT 'reported',
  approved_at timestamptz, approved_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.medical_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.policies(id),
  snapshot jsonb NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  director_signature_url text, pdf_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type public.document_owner_type NOT NULL,
  owner_id uuid NOT NULL,
  kind text, file_url text NOT NULL, file_name text, mime_type text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  program_id uuid REFERENCES public.programs(id),
  entity_type text NOT NULL, entity_id uuid,
  action text NOT NULL, diff jsonb, ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  channel public.notification_channel NOT NULL,
  subject text, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.notification_channel NOT NULL,
  recipient text NOT NULL, template_code text, payload jsonb,
  status text NOT NULL DEFAULT 'queued', sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.system_config (
  key text PRIMARY KEY, value jsonb NOT NULL,
  description text, updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GRANTS ============
GRANT SELECT ON public.programs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT ON public.user_program_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_programs TO authenticated;
GRANT SELECT ON public.program_coverages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dependents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_passes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT ON public.notification_templates TO authenticated;
GRANT SELECT, INSERT ON public.notifications TO authenticated;
GRANT SELECT ON public.system_config TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_program_access(_user_id uuid, _program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_program_access WHERE user_id = _user_id AND program_id = _program_id);
$$;

CREATE OR REPLACE FUNCTION public.has_program_role(_user_id uuid, _program_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_program_access WHERE user_id = _user_id AND program_id = _program_id AND role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_program_access WHERE user_id = _user_id AND role = 'admin');
$$;

-- ============ AUTH USER TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ UPDATED_AT ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_policies_updated BEFORE UPDATE ON public.policies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_incidents_updated BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ENABLE RLS ============
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_program_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY "Read programs" ON public.programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read coverages" ON public.program_coverages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read templates" ON public.notification_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read config" ON public.system_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Read own program access" ON public.user_program_access FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Read clients via access" ON public.clients FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_programs cp WHERE cp.client_id = clients.id AND public.has_program_access(auth.uid(), cp.program_id))
  OR NOT EXISTS (SELECT 1 FROM public.client_programs cp WHERE cp.client_id = clients.id)
);
CREATE POLICY "Insert clients authenticated" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update clients via role" ON public.clients FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_programs cp WHERE cp.client_id = clients.id AND public.has_program_role(auth.uid(), cp.program_id, ARRAY['admin','manager','operator']::public.app_role[]))
);
CREATE POLICY "Delete clients admin" ON public.clients FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_programs cp WHERE cp.client_id = clients.id AND public.has_program_role(auth.uid(), cp.program_id, ARRAY['admin']::public.app_role[]))
);

CREATE POLICY "Read client_programs" ON public.client_programs FOR SELECT TO authenticated USING (public.has_program_access(auth.uid(), program_id));
CREATE POLICY "Insert client_programs" ON public.client_programs FOR INSERT TO authenticated WITH CHECK (public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager','operator','sales']::public.app_role[]));
CREATE POLICY "Update client_programs" ON public.client_programs FOR UPDATE TO authenticated USING (public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "Delete client_programs" ON public.client_programs FOR DELETE TO authenticated USING (public.has_program_role(auth.uid(), program_id, ARRAY['admin']::public.app_role[]));

CREATE POLICY "Read policies" ON public.policies FOR SELECT TO authenticated USING (public.has_program_access(auth.uid(), program_id));
CREATE POLICY "Insert policies" ON public.policies FOR INSERT TO authenticated WITH CHECK (public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager','operator','sales']::public.app_role[]));
CREATE POLICY "Update policies" ON public.policies FOR UPDATE TO authenticated USING (public.has_program_role(auth.uid(), program_id, ARRAY['admin','manager','operator']::public.app_role[]));
CREATE POLICY "Delete policies" ON public.policies FOR DELETE TO authenticated USING (public.has_program_role(auth.uid(), program_id, ARRAY['admin']::public.app_role[]));

CREATE POLICY "Beneficiaries access" ON public.beneficiaries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_access(auth.uid(), p.program_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','operator']::public.app_role[])));

CREATE POLICY "Dependents access" ON public.dependents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_access(auth.uid(), p.program_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','operator']::public.app_role[])));

CREATE POLICY "Schedules access" ON public.payment_schedules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_access(auth.uid(), p.program_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','operator']::public.app_role[])));

CREATE POLICY "Read payments" ON public.payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_access(auth.uid(), p.program_id)));
CREATE POLICY "Insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','operator']::public.app_role[])));
CREATE POLICY "Update payments" ON public.payments FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','operator']::public.app_role[])));
CREATE POLICY "Delete payments" ON public.payments FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin']::public.app_role[])));

CREATE POLICY "Read incidents" ON public.incidents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_access(auth.uid(), p.program_id)));
CREATE POLICY "Insert incidents" ON public.incidents FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','operator','claims']::public.app_role[])));
CREATE POLICY "Update incidents" ON public.incidents FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','claims']::public.app_role[])));
CREATE POLICY "Delete incidents" ON public.incidents FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin']::public.app_role[])));

CREATE POLICY "Read medical_passes" ON public.medical_passes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_access(auth.uid(), p.program_id)));
CREATE POLICY "Insert medical_passes" ON public.medical_passes FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','claims']::public.app_role[])));
CREATE POLICY "Update medical_passes" ON public.medical_passes FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.policies p WHERE p.id = policy_id AND public.has_program_role(auth.uid(), p.program_id, ARRAY['admin','manager','claims']::public.app_role[])));

CREATE POLICY "Read documents" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Update own documents" ON public.documents FOR UPDATE TO authenticated USING (auth.uid() = uploaded_by);
CREATE POLICY "Delete own documents" ON public.documents FOR DELETE TO authenticated USING (auth.uid() = uploaded_by);

CREATE POLICY "Read audit" ON public.audit_log FOR SELECT TO authenticated USING (program_id IS NULL OR public.has_program_access(auth.uid(), program_id));
CREATE POLICY "Insert audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Read notifications" ON public.notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
