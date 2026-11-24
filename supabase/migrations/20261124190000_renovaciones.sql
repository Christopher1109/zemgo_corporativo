-- Módulo de Renovaciones (programas anuales: FutCare y Manos con Valor).
-- get_renewals(programa, desde, hasta): certificados individuales cuya vigencia termina en el rango,
-- con el estado de su renovación:
--   renovado  → el cobro de renovación está pagado, o ya existe una póliza renovada activa/pagada.
--   cancelado → la póliza se canceló, o el cobro de renovación se canceló sin renovar.
--   vencido   → ya pasó su fecha y no ha renovado.
--   pendiente → todavía no vence y no ha renovado.
-- Monto esperado: el cobro de renovación si ya existe; si no, el precio vigente del programa.
-- SECURITY INVOKER: respeta los permisos (RLS) de quien consulta.

CREATE OR REPLACE FUNCTION public.get_renewals(_program_id uuid, _from date, _to date)
RETURNS TABLE (
  policy_id uuid, folio text, certificate_number text, client_id uuid, client_name text,
  phone text, email text, curp text, start_date date, end_date date, policy_status text,
  renewal_status text, expected_amount numeric, paid_amount numeric, paid_at timestamptz,
  renewal_payment_id uuid, renewed_policy_id uuid
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
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
    coalesce(rp.id, np.id), n.id
  FROM policies p
  JOIN programs pr ON pr.id = p.program_id
  JOIN clients c ON c.id = p.client_id
  -- Cobro de renovación sobre la misma póliza (lo genera el calendario anual al acercarse el fin de vigencia)
  LEFT JOIN LATERAL (
    SELECT x.* FROM payments x
     WHERE x.policy_id = p.id AND x.payment_schedule_id IS NOT NULL
       AND x.due_date BETWEEN p.end_date - 45 AND p.end_date + 60
     ORDER BY (x.status = 'paid') DESC, x.created_at DESC LIMIT 1
  ) rp ON true
  -- Renovación como póliza nueva (botón "Renovar")
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
$$;

GRANT EXECUTE ON FUNCTION public.get_renewals(uuid, date, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
