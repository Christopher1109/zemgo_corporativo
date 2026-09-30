import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ program_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("companies")
      .select("id, legal_name, rfc, contact_name, email, phone, city, state, is_active, created_at, program_id, programs(code, name, color_primary)")
      .order("created_at", { ascending: false });
    q = q.eq("program_id", data.program_id || "00000000-0000-0000-0000-000000000000"); // siempre un programa
    const { data: companies, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (companies ?? []).map((c: any) => c.id);
    // employees = asegurados con al menos un certificado vigente; cancelledEmployees = bajas.
    // premium = solo certificados activos (las bajas no se cobran).
    const counts: Record<string, { employees: number; cancelledEmployees: number; totalEmployees: number; policies: number; active: number; premium: number }> = {};
    ids.forEach((id) => (counts[id] = { employees: 0, cancelledEmployees: 0, totalEmployees: 0, policies: 0, active: 0, premium: 0 }));

    if (ids.length) {
      const { data: pols } = await supabase
        .from("policies")
        .select("id, company_id, client_id, status, premium")
        .in("company_id", ids);
      const activeClients: Record<string, Set<string>> = {};
      (pols ?? []).forEach((p: any) => {
        const c = counts[p.company_id];
        if (!c) return;
        c.policies += 1;
        if (p.status === "active") {
          c.active += 1;
          c.premium += Number(p.premium ?? 0);
          activeClients[p.company_id] ??= new Set();
          if (p.client_id) activeClients[p.company_id].add(p.client_id);
        }
      });
      const { data: cls } = await supabase.from("clients").select("id, company_id").in("company_id", ids);
      (cls ?? []).forEach((c: any) => {
        const k = counts[c.company_id];
        if (!k) return;
        k.totalEmployees += 1;
        if (activeClients[c.company_id]?.has(c.id)) k.employees += 1;
        else k.cancelledEmployees += 1;
      });
    }

    return (companies ?? []).map((c: any) => ({ ...c, stats: counts[c.id] }));
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        program_id: z.string().uuid(),
        legal_name: z.string().min(2),
        rfc: z.string().optional().nullable(),
        contact_name: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        address_full: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("companies")
      .insert({ ...data, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        legal_name: z.string().min(2),
        rfc: z.string().optional().nullable(),
        contact_name: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        address_full: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { company_id, ...fields } = data;
    const { error } = await supabase.from("companies").update(fields).eq("id", company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Detach clients and certificates (keep the people and their policies intact),
    // then remove the company shell and its import history.
    await supabase.from("clients").update({ company_id: null }).eq("company_id", data.company_id);
    await supabase.from("policies").update({ company_id: null }).eq("company_id", data.company_id);
    const { error } = await supabase.from("companies").delete().eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCompanyDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: company, error } = await supabase
      .from("companies")
      .select("*, programs(id, code, name, color_primary)")
      .eq("id", data.company_id)
      .single();
    if (error) throw new Error(error.message);

    const { data: policies } = await supabase
      .from("policies")
      .select("id, folio, certificate_number, status, premium, start_date, end_date, certificate_pdf_url, client_id, clients(id, first_name, last_name, curp, email, phone)")
      .eq("company_id", data.company_id)
      .order("folio", { ascending: true });

    const polIds = (policies ?? []).map((p: any) => p.id);
    let payments: any[] = [];
    if (polIds.length) {
      const { data: pays } = await supabase
        .from("payments")
        .select("id, policy_id, amount, status, due_date, paid_at")
        .in("policy_id", polIds);
      payments = pays ?? [];
    }

    const { data: imports } = await supabase
      .from("company_imports")
      .select("id, file_name, rows_detected, rows_created, rows_failed, details, created_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: charges } = await (supabase as any)
      .from("company_charges")
      .select("id, period, due_date, insured_count, unit_price, amount, status, paid_at, paid_amount, method, reference, notes")
      .eq("company_id", data.company_id)
      .order("period", { ascending: false })
      .limit(24);

    return { company, policies: policies ?? [], payments, imports: imports ?? [], charges: (charges ?? []) as any[] };
  });

const employeeRow = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  curp: z.string().min(10),
  rfc: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address_full: z.string().optional().nullable(),
  beneficiary_name: z.string().optional().nullable(),
  beneficiary_relationship: z.string().optional().nullable(),
});

export const importCompanyEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        file_name: z.string().optional().nullable(),
        issue_date: z.string(),
        start_date: z.string(),
        end_date: z.string(),
        premium: z.number().optional().nullable(),
        sum_insured: z.number().optional().nullable(),
        rows: z.array(employeeRow).min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, legal_name, program_id")
      .eq("id", data.company_id)
      .single();
    if (cErr) throw new Error(cErr.message);

    const programId = company.program_id as string;
    const { data: prog } = await supabase
      .from("programs")
      .select("policy_number")
      .eq("id", programId)
      .maybeSingle();

    const details: Array<{ curp: string; name: string; ok: boolean; folio?: string; error?: string }> = [];
    let created = 0;
    let failed = 0;

    for (const r of data.rows) {
      const curp = r.curp.trim().toUpperCase();
      const name = `${r.first_name} ${r.last_name}`.trim();
      try {
        // Client: reuse when the CURP already exists, otherwise create.
        let clientId: string | null = null;
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("curp", curp)
          .maybeSingle();

        if (existing) {
          clientId = existing.id as string;
          await supabase.from("clients").update({ company_id: data.company_id }).eq("id", clientId);
        } else {
          const { data: ins, error: insErr } = await supabase
            .from("clients")
            .insert({
              first_name: r.first_name.trim(),
              last_name: r.last_name.trim(),
              curp,
              rfc: r.rfc ? r.rfc.trim().toUpperCase() : null,
              date_of_birth: r.date_of_birth || null,
              gender: r.gender || null,
              email: r.email || null,
              phone: r.phone || null,
              address_full: r.address_full || null,
              company_id: data.company_id,
              created_by: userId,
            })
            .select("id")
            .single();
          if (insErr) throw new Error(insErr.message);
          clientId = ins.id as string;
        }

        // Enrollment
        const { data: cp } = await supabase
          .from("client_programs")
          .select("id")
          .eq("client_id", clientId)
          .eq("program_id", programId)
          .maybeSingle();
        if (!cp) {
          const { error: cpErr } = await supabase
            .from("client_programs")
            .insert({ client_id: clientId, program_id: programId, status: "prospect" });
          if (cpErr) throw new Error(cpErr.message);
        }

        // One certificate per person
        const { data: folio, error: folioErr } = await supabase.rpc("next_policy_folio", {
          _program_id: programId,
        });
        if (folioErr) throw new Error(folioErr.message);

        const { data: policy, error: polErr } = await supabase
          .from("policies")
          .insert({
            client_id: clientId,
            program_id: programId,
            company_id: data.company_id,
            folio: folio as string,
            policy_number: prog?.policy_number ?? null,
            certificate_number: folio as string,
            issue_date: data.issue_date,
            start_date: data.start_date,
            end_date: data.end_date,
            contracting_party: company.legal_name as string,
            premium: data.premium ?? null,
            sum_insured: data.sum_insured ?? null,
            status: "pending_payment",
            created_by: userId,
          })
          .select("id, folio")
          .single();
        if (polErr) throw new Error(polErr.message);

        await supabase.from("beneficiaries").insert({
          policy_id: policy.id,
          full_name: (r.beneficiary_name || name).trim(),
          relationship: r.beneficiary_relationship || "Beneficiario",
          percentage: 100,
          display_order: 0,
        });

        created += 1;
        details.push({ curp, name, ok: true, folio: policy.folio as string });
      } catch (e: any) {
        failed += 1;
        details.push({ curp, name, ok: false, error: e?.message ?? "Error desconocido" });
      }
    }

    await supabase.from("company_imports").insert({
      company_id: data.company_id,
      file_name: data.file_name ?? null,
      rows_detected: data.rows.length,
      rows_created: created,
      rows_failed: failed,
      details,
      created_by: userId,
    });

    return { created, failed, details };
  });
