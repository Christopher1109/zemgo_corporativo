-- v_cobranza: nueva columna coverage_active.
-- true cuando el cobro está atrasado pero el asegurado SIGUE CUBIERTO: programa de cobro anual
-- (FutCare), póliza activa y su vigencia todavía no termina. Ej.: cobros manuales a quien ya
-- tenía cobertura y faltaba su pago (Zita Valdivia y familia). En pantalla se muestra
-- "Pago pendiente" en lugar de "Vencido". En ABC (mensual) no aplica: si no paga el mes, no
-- está cubierto, así que sigue diciendo "Vencido".
-- Solo se agrega la columna al final; el resto de la vista queda igual.

CREATE OR REPLACE VIEW public.v_cobranza WITH (security_invoker = true) AS
 SELECT
        CASE
            WHEN pol.company_id IS NULL THEN 'cliente'::text
            ELSE 'torneo_jugador'::text
        END AS kind,
    'payments'::text AS source,
    pay.id,
    pol.program_id,
    pr.code AS program_code,
    pr.name AS program_name,
    pr.color_primary AS program_color,
    btrim((cl.first_name || ' '::text) || cl.last_name) AS debtor_name,
    co.legal_name AS group_name,
    pol.client_id,
    pol.company_id,
    pay.policy_id,
    pol.folio,
    cl.curp,
    pol.status::text AS policy_status,
    pay.amount,
    pay.paid_amount,
    pay.status::text AS status,
    pay.due_date,
    pay.paid_at,
    pay.method::text AS method,
    pay.bank_reference,
    pol.company_id IS NULL AND (pol.status = ANY (ARRAY['pending_payment'::policy_status, 'draft'::policy_status])) AS is_activation,
    NULL::integer AS insured_count,
    NULL::date AS period,
    pay.provider_transaction_id,
    pay.control_number,
    pay.failure_reason,
    (pr.billing_frequency = 'yearly' AND pol.status = 'active'::policy_status AND pol.end_date >= CURRENT_DATE) AS coverage_active
   FROM payments pay
     JOIN policies pol ON pol.id = pay.policy_id
     JOIN programs pr ON pr.id = pol.program_id
     JOIN clients cl ON cl.id = pol.client_id
     LEFT JOIN companies co ON co.id = pol.company_id
  WHERE pol.company_id IS NULL OR co.group_type IS NOT NULL
UNION ALL
 SELECT 'torneo'::text AS kind,
    'payments'::text AS source,
    pay.id,
    co.program_id,
    pr.code AS program_code,
    pr.name AS program_name,
    pr.color_primary AS program_color,
    co.legal_name AS debtor_name,
    co.legal_name AS group_name,
    co.contact_client_id AS client_id,
    co.id AS company_id,
    NULL::uuid AS policy_id,
    NULL::text AS folio,
    NULL::text AS curp,
    NULL::text AS policy_status,
    pay.amount,
    pay.paid_amount,
    pay.status::text AS status,
    pay.due_date,
    pay.paid_at,
    pay.method::text AS method,
    pay.bank_reference,
    false AS is_activation,
    NULLIF(pay.metadata ->> 'insured_count'::text, ''::text)::integer AS insured_count,
    NULL::date AS period,
    pay.provider_transaction_id,
    pay.control_number,
    pay.failure_reason,
    false AS coverage_active
   FROM payments pay
     JOIN companies co ON co.id = pay.company_id
     JOIN programs pr ON pr.id = co.program_id
  WHERE pay.policy_id IS NULL
UNION ALL
 SELECT 'empresa'::text AS kind,
    'company_charges'::text AS source,
    cc.id,
    cc.program_id,
    pr.code AS program_code,
    pr.name AS program_name,
    pr.color_primary AS program_color,
    co.legal_name AS debtor_name,
    co.legal_name AS group_name,
    NULL::uuid AS client_id,
    co.id AS company_id,
    NULL::uuid AS policy_id,
    NULL::text AS folio,
    NULL::text AS curp,
    NULL::text AS policy_status,
    cc.amount,
    cc.paid_amount,
    cc.status::text AS status,
    cc.due_date,
    cc.paid_at,
    cc.method::text AS method,
    cc.reference AS bank_reference,
    false AS is_activation,
    cc.insured_count,
    cc.period,
    NULL::text AS provider_transaction_id,
    NULL::text AS control_number,
    NULL::text AS failure_reason,
    false AS coverage_active
   FROM company_charges cc
     JOIN companies co ON co.id = cc.company_id
     JOIN programs pr ON pr.id = cc.program_id;

NOTIFY pgrst, 'reload schema';
