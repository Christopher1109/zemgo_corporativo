DO $$
DECLARE v_company uuid := '1b0cb413-9565-45d9-9c15-30f53858f0f0'; v_prog uuid; v_clients uuid[];
BEGIN
  SELECT program_id INTO v_prog FROM public.companies WHERE id = v_company;
  SELECT array_agg(p.client_id) INTO v_clients FROM public.policies p
   WHERE p.company_id = v_company AND p.metadata->>'source' = 'actualizacion_mensual_2026-11';

  DELETE FROM public.dependents WHERE policy_id IN (SELECT id FROM public.policies WHERE company_id = v_company AND metadata->>'source' = 'actualizacion_mensual_2026-11');
  DELETE FROM public.policies WHERE company_id = v_company AND metadata->>'source' = 'actualizacion_mensual_2026-11';
  DELETE FROM public.client_programs WHERE client_id = ANY(v_clients);
  DELETE FROM public.documents WHERE owner_type = 'client' AND owner_id = ANY(v_clients);
  DELETE FROM public.clients WHERE id = ANY(v_clients) AND metadata->>'source' = 'actualizacion_mensual_2026-11'
    AND NOT EXISTS (SELECT 1 FROM public.policies q WHERE q.client_id = clients.id);

  -- Misael Mina Martínez: revertir la baja
  UPDATE public.policies SET status = 'active', metadata = metadata - 'cancellation'
   WHERE company_id = v_company AND client_id = (SELECT id FROM public.clients WHERE curp = 'MMM041219HVZNRSA9')
     AND metadata->'cancellation'->>'source' = 'actualizacion_mensual_2026-11';
  UPDATE public.client_programs SET status = 'active', cancelled_at = NULL
   WHERE program_id = v_prog AND client_id = (SELECT id FROM public.clients WHERE curp = 'MMM041219HVZNRSA9');

  DELETE FROM public.company_imports WHERE company_id = v_company AND details->>'period' = '2026-11' AND created_at::date = '2026-11-13';

  INSERT INTO public.audit_log(program_id, entity_type, entity_id, action, diff)
  VALUES (v_prog, 'company', v_company, 'COMPANY_MONTHLY_REVERT',
          jsonb_build_object('period','2026-11','note','Se deshizo la actualización de noviembre aplicada el 13/11 (hoja de bajas abreviada NOV no fue leída)'));
END $$;