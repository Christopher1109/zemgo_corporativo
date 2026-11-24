-- Renovaciones también para ABC (cobro MENSUAL).
-- Programas anuales (FutCare, MCV): igual que antes, certificados cuya vigencia termina en el mes.
-- Programas mensuales (ABC): "renovar" es pagar la mensualidad del mes:
--   * clientes individuales: su cobro mensual con vencimiento en el rango (o el que viene en su
--     calendario si todavía no se genera);
--   * empresas (p. ej. Transportes Bueno): su mensualidad del periodo, con # de asegurados;
--   * bajas del mes: asegurados dados de baja con fecha en el rango (cuentan como cancelados).
-- Se agregan las columnas kind ('cliente' | 'empresa' | 'baja'), company_id e insured_count.

DROP FUNCTION IF EXISTS public.get_renewals(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_renewals(_program_id uuid, _from date, _to date)
RETURNS TABLE (
  policy_id uuid, folio text, certificate_number text, client_id uuid, client_name text,
  phone text, email text, curp text, start_date date, end_date date, policy_status text,
  renewal_status text, expected_amount numeric, paid_amount numeric, paid_at timestamptz,
  renewal_payment_id uuid, renewed_policy_id uuid,
  kind text, company_id uuid, insured_count integer
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $fn$
DECLARE v_monthly boolean;
BEGIN
  SELECT coalesce(billing_frequency, 'yearly') = 'monthly' INTO v_monthly FROM programs WHERE id = _program_id;

  IF NOT coalesce(v_monthly, false) THEN
    -- ---------------- Programas anuales ----------------
    RETURN QUERY
    SELECT
      p.id, p.folio, p.certificate_number, c.id,
      btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
      coalesce(nullif(c.phone, ''), nullif(c.payer_phone, '')), c.email, c.curp,
      p.start_date, p.end_date, p.status::text,
      st.renewal_status,
      coalesce(rp.amount, np.amount, n.premium, pr.default_premium),
      CASE WHEN st.renewal_status = 'renovado'
           THEN coalesce(CASE WHEN rp.status = 'paid' THEN coalesce(rp.paid_amount, rp.amount) END,
                         CASE WHEN np.status = 'paid' THEN coalesce(np.paid_amount, np.amount) END, 0)
           ELSE 0 END,
      CASE WHEN rp.status = 'paid' THEN rp.paid_at WHEN np.status = 'paid' THEN np.paid_at END,
      coalesce(rp.id, np.id), n.id,
      'cliente'::text, NULL::uuid, NULL::integer
    FROM policies p
    JOIN programs pr ON pr.id = p.program_id
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM payments x
       WHERE x.policy_id = p.id AND x.payment_schedule_id IS NOT NULL
         AND x.due_date BETWEEN p.end_date - 45 AND p.end_date + 60
       ORDER BY (x.status = 'paid') DESC, x.created_at DESC LIMIT 1
    ) rp ON true
    LEFT JOIN LATERAL (
      SELECT q.* FROM policies q WHERE q.renewed_from_id = p.id ORDER BY q.created_at DESC LIMIT 1
    ) n ON true
    LEFT JOIN LATERAL (
      SELECT y.* FROM payments y WHERE y.policy_id = n.id
       ORDER BY (y.status = 'paid') DESC, y.created_at DESC LIMIT 1
    ) np ON true
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN rp.status = 'paid' OR np.status = 'paid' OR n.status = 'active' THEN 'renovado'
        WHEN p.status = 'cancelled' OR (rp.status = 'cancelled' AND n.id IS NULL) OR n.status = 'cancelled' THEN 'cancelado'
        WHEN p.end_date < current_date THEN 'vencido'
        ELSE 'pendiente'
      END AS renewal_status
    ) st
    WHERE p.program_id = _program_id
      AND p.company_id IS NULL
      AND p.end_date BETWEEN _from AND _to
      AND p.status::text IN ('active', 'suspended', 'expired', 'cancelled')
    ORDER BY p.end_date, 5;
    RETURN;
  END IF;

  -- ---------------- Programas mensuales (ABC) ----------------
  RETURN QUERY
  WITH rows AS (
    -- Clientes individuales: mensualidad del rango
    SELECT
      p.id AS policy_id, p.folio, p.certificate_number, c.id AS client_id,
      btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS client_name,
      coalesce(nullif(c.phone, ''), nullif(c.payer_phone, '')) AS phone, c.email, c.curp,
      p.start_date, x.due_date AS end_date, p.status::text AS policy_status,
      CASE
        WHEN x.status = 'paid' THEN 'renovado'
        WHEN x.status = 'cancelled' OR p.status = 'cancelled' THEN 'cancelado'
        WHEN x.due_date < current_date THEN 'vencido'
        ELSE 'pendiente'
      END AS renewal_status,
      x.amount AS expected_amount,
      CASE WHEN x.status = 'paid' THEN coalesce(x.paid_amount, x.amount) ELSE 0 END AS paid_amount,
      CASE WHEN x.status = 'paid' THEN x.paid_at END AS paid_at,
      x.id AS renewal_payment_id, NULL::uuid AS renewed_policy_id,
      'cliente'::text AS kind, NULL::uuid AS company_id, NULL::integer AS insured_count
    FROM payments x
    JOIN policies p ON p.id = x.policy_id
    JOIN clients c ON c.id = p.client_id
    WHERE p.program_id = _program_id AND p.company_id IS NULL
      AND x.due_date BETWEEN _from AND _to
      AND x.status::text NOT IN ('refunded')
    UNION ALL
    -- Clientes individuales cuya mensualidad del rango aún no se genera (se crea 10 días antes):
    -- se toma del calendario de cobros para que el mes próximo ya cuente.
    SELECT
      p.id, p.folio, p.certificate_number, c.id,
      btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
      coalesce(nullif(c.phone, ''), nullif(c.payer_phone, '')), c.email, c.curp,
      p.start_date, s.next_due_date, p.status::text,
      'pendiente', s.amount, 0::numeric, NULL::timestamptz, NULL::uuid, NULL::uuid,
      'cliente'::text, NULL::uuid, NULL::integer
    FROM payment_schedules s
    JOIN policies p ON p.id = s.policy_id
    JOIN clients c ON c.id = p.client_id
    WHERE p.program_id = _program_id AND p.company_id IS NULL AND p.status::text IN ('active', 'suspended')
      AND s.next_due_date BETWEEN _from AND _to
      AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.policy_id = p.id AND x.due_date = s.next_due_date)
    UNION ALL
    -- Empresas: mensualidad del periodo
    SELECT
      NULL::uuid, NULL::text, NULL::text, NULL::uuid,
      co.legal_name, NULL::text, NULL::text, NULL::text,
      cc.period, cc.due_date, NULL::text,
      CASE
        WHEN cc.status::text = 'paid' THEN 'renovado'
        WHEN cc.status::text = 'cancelled' THEN 'cancelado'
        WHEN cc.due_date < current_date THEN 'vencido'
        ELSE 'pendiente'
      END,
      cc.amount,
      CASE WHEN cc.status::text = 'paid' THEN coalesce(cc.paid_amount, cc.amount) ELSE 0 END,
      CASE WHEN cc.status::text = 'paid' THEN cc.paid_at END,
      cc.id, NULL::uuid,
      'empresa'::text, co.id, cc.insured_count
    FROM company_charges cc
    JOIN companies co ON co.id = cc.company_id
    WHERE cc.program_id = _program_id AND cc.due_date BETWEEN _from AND _to
    UNION ALL
    -- Bajas del rango (individuales y de empresa)
    SELECT
      p.id, p.folio, p.certificate_number, c.id,
      btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
      coalesce(nullif(c.phone, ''), nullif(c.payer_phone, '')), c.email, c.curp,
      p.start_date, (p.metadata->'cancellation'->>'date')::date, p.status::text,
      'cancelado', 0::numeric, 0::numeric, NULL::timestamptz,
      NULL::uuid, NULL::uuid,
      'baja'::text, p.company_id, NULL::integer
    FROM policies p
    JOIN clients c ON c.id = p.client_id
    WHERE p.program_id = _program_id AND p.status = 'cancelled'
      AND (p.metadata->'cancellation'->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
      AND (p.metadata->'cancellation'->>'date')::date BETWEEN _from AND _to
  )
  SELECT r.policy_id, r.folio, r.certificate_number, r.client_id, r.client_name, r.phone, r.email, r.curp,
         r.start_date, r.end_date, r.policy_status, r.renewal_status, r.expected_amount, r.paid_amount,
         r.paid_at, r.renewal_payment_id, r.renewed_policy_id, r.kind, r.company_id, r.insured_count
  FROM rows r
  ORDER BY (r.kind = 'baja'), r.end_date, r.client_name;
END $fn$;

GRANT EXECUTE ON FUNCTION public.get_renewals(uuid, date, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
