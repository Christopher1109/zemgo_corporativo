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
      .select("id, legal_name, rfc, contact_name, email, phone, city, state, is_active, created_at, program_id, group_type, billing_mode, location, coverage_start, coverage_end, pricing_mode, unit_price, flat_amount, address_full, notes, programs(code, name, color_primary)" as any)
      .order("created_at", { ascending: false });
    q = q.eq("program_id", data.program_id || "00000000-0000-0000-0000-000000000000"); // siempre un programa
    const { data: companies, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (companies ?? []).map((c: any) => c.id);
    // employees = asegurados con al menos un certificado vigente; cancelledEmployees = bajas.
    // premium = solo certificados activos (las bajas no se cobran).
    const counts: Record<string, { employees: number; cancelledEmployees: number; totalEmployees: number; policies: number; active: number; pending: number; premium: number }> = {};
    ids.forEach((id) => (counts[id] = { employees: 0, cancelledEmployees: 0, totalEmployees: 0, policies: 0, active: 0, pending: 0, premium: 0 }));

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
        if (p.status === "pending_payment" || p.status === "draft") c.pending += 1;
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

const groupFields = {
  group_type: z.enum(["torneo", "equipo", "club"]).optional().nullable(),
  billing_mode: z.enum(["company", "individual"]).optional(),
  location: z.string().optional().nullable(),
  coverage_start: z.string().optional().nullable(),
  coverage_end: z.string().optional().nullable(),
  pricing_mode: z.enum(["per_person", "flat"]).optional().nullable(),
  unit_price: z.number().nonnegative().optional().nullable(),
  flat_amount: z.number().nonnegative().optional().nullable(),
};

const CONTACT_ERRORS: Record<string, string> = {
  grupo_no_encontrado: "No se encontró el grupo.",
  forbidden: "No tienes permiso para dar acceso al encargado.",
  falta_encargado: "Falta el nombre o teléfono del encargado.",
};

/** Registra/actualiza al encargado vía RPC. Nunca lanza: regresa un aviso si falla. */
async function upsertGroupContact(supabase: any, companyId: string): Promise<string | null> {
  try {
    const { error } = await (supabase.rpc as any)("upsert_group_contact", { _company_id: companyId });
    if (!error) return null;
    const code = Object.keys(CONTACT_ERRORS).find((k) => error.message?.includes(k));
    return `El grupo se guardó, pero el encargado no tiene acceso al portal: ${code ? CONTACT_ERRORS[code] : error.message}`;
  } catch (e: any) {
    return `El grupo se guardó, pero el encargado no tiene acceso al portal: ${e?.message ?? "error desconocido"}`;
  }
}

export const grantGroupContactAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const warning = await upsertGroupContact(context.supabase, data.company_id);
    return { ok: !warning, contact_warning: warning };
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
        ...groupFields,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase.from("companies") as any)
      .insert({ ...data, billing_mode: data.billing_mode ?? "company", created_by: userId })
      .select("id, program_id")
      .single();
    if (error) throw new Error(error.message);
    let contact_warning: string | null = null;
    if (data.group_type) {
      contact_warning = await upsertGroupContact(supabase, row.id);
      try {
        await (supabase.rpc as any)("refresh_group_charge", { _company_id: row.id });
      } catch {
        /* no bloquea la creación */
      }
    }
    return { id: row.id as string, contact_warning };
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
        ...groupFields,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { company_id, ...fields } = data;
    const { data: before } = await (supabase.from("companies") as any)
      .select("id, program_id, group_type, billing_mode, contact_client_id, contact_name, phone, email")
      .eq("id", company_id)
      .single();
    const { error } = await (supabase.from("companies") as any).update(fields).eq("id", company_id);
    if (error) throw new Error(error.message);
    const isGroup = !!(fields.group_type ?? before?.group_type);
    let contact_warning: string | null = null;
    if (isGroup && before) {
      contact_warning = await upsertGroupContact(supabase, company_id);
      // Recalcula el cobro y la vigencia de los certificados aún no pagados
      // (cambio de modo de pago, costo o fechas de cobertura).
      await (supabase.rpc as any)("refresh_group_charge", { _company_id: company_id });
    }
    return { ok: true, contact_warning };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // No se borra una empresa/torneo con dinero ya cobrado: se perdería de la cobranza y los reportes.
    const [{ count: paidGroup }, { count: paidCharges }] = await Promise.all([
      (supabase.from("payments") as any).select("id", { count: "exact", head: true }).eq("company_id", data.company_id).eq("status", "paid"),
      (supabase as any).from("company_charges").select("id", { count: "exact", head: true }).eq("company_id", data.company_id).eq("status", "paid"),
    ]);
    if ((paidGroup ?? 0) + (paidCharges ?? 0) > 0) {
      throw new Error("No se puede eliminar: ya tiene pagos registrados. Márcalo como inactivo para conservar su historial de cobranza.");
    }
    // Detach clients and certificates (keep the people and their policies intact),
    // then remove the company shell and its import history.
    await supabase.from("clients").update({ company_id: null }).eq("company_id", data.company_id);
    await supabase.from("policies").update({ company_id: null }).eq("company_id", data.company_id);
    const { error } = await supabase.from("companies").delete().eq("id", data.company_id);
    if (error)
      throw new Error(
        error.message.includes("tiene_pagos")
          ? "No se puede eliminar: ya tiene pagos registrados. Márcalo como inactivo para conservar su historial de cobranza."
          : error.message,
      );
    return { ok: true };
  });

export const getCompanyDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: company, error } = await supabase
      .from("companies")
      .select("*, programs(id, code, name, color_primary, default_premium)")
      .eq("id", data.company_id)
      .single();
    if (error) throw new Error(error.message);

    const { data: policies } = await supabase
      .from("policies")
      .select("id, folio, certificate_number, status, premium, start_date, end_date, certificate_pdf_url, client_id, clients(id, first_name, last_name, curp, email, phone, payer_phone)")
      .eq("company_id", data.company_id)
      .order("folio", { ascending: true });

    const polIds = (policies ?? []).map((p: any) => p.id);
    let payments: any[] = [];
    if (polIds.length) {
      const { data: pays } = await supabase
        .from("payments")
        .select("id, policy_id, amount, status, due_date, paid_at, bank_reference, paid_amount")
        .in("policy_id", polIds);
      payments = pays ?? [];
    }

    // Cobro grupal (paga el encargado): payments con company_id y sin póliza.
    const { data: groupCharges } = await (supabase.from("payments") as any)
      .select("id, amount, status, due_date, paid_at, paid_amount, bank_reference, bank_reference_expires_at, metadata, created_at")
      .eq("company_id", data.company_id)
      .is("policy_id", null)
      .order("created_at", { ascending: false })
      .limit(12);

    const { data: imports } = await supabase
      .from("company_imports")
      .select("id, file_name, rows_detected, rows_created, rows_failed, details, created_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: charges } = await (supabase as any)
      .from("company_charges")
      .select("id, company_id, period, due_date, insured_count, unit_price, amount, status, paid_at, paid_amount, method, reference, notes")
      .eq("company_id", data.company_id)
      .order("period", { ascending: false })
      .limit(24);

    return { company, policies: policies ?? [], payments, imports: imports ?? [], charges: (charges ?? []) as any[], groupCharges: (groupCharges ?? []) as any[] };
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
  marital_status: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  colonia: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  curp_alert: z.string().optional().nullable(),
});

export const importCompanyEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        file_name: z.string().optional().nullable(),
        issue_date: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        /** FutCare: vigencia = alta del grupo (Monterrey) a +1 año, precio del programa. */
        group_terms: z.boolean().optional(),
        premium: z.number().optional().nullable(),
        sum_insured: z.number().optional().nullable(),
        rows: z.array(employeeRow).min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // El alta se hace en la base (import_company_members): valida permisos del programa,
    // crea cliente, inscripción, certificado y beneficiario, y registra la importación.
    // (Insertar directo en clients fallaba por las reglas de seguridad al leerlo de vuelta.)
    const { data: res, error } = await (supabase.rpc as any)("import_company_members", {
      _company_id: data.company_id,
      _rows: data.rows,
      _file_name: data.file_name ?? null,
      _issue_date: data.issue_date ?? null,
      _start_date: data.start_date ?? null,
      _end_date: data.end_date ?? null,
      _premium: data.premium ?? null,
      _sum_insured: data.sum_insured ?? null,
      _group_terms: !!data.group_terms,
    });
    if (error) throw new Error(error.message === "forbidden" ? "No tienes permiso para dar de alta asegurados en este programa." : error.message);
    const r: any = res ?? {};
    return {
      created: Number(r.created ?? 0),
      failed: Number(r.failed ?? 0),
      details: (r.details ?? []) as Array<{ curp: string; name: string; ok: boolean; folio?: string; error?: string }>,
      policies: (r.policies ?? []) as Array<{ id: string; folio: string; first_name: string; last_name: string }>,
    };
  });

async function assertGroupWriter(supabase: any, userId: string, companyId: string) {
  const { data: company, error } = await (supabase.from("companies") as any)
    .select("id, program_id, legal_name")
    .eq("id", companyId)
    .single();
  if (error || !company) throw new Error("Grupo no encontrado.");
  const { data: superAdmin } = await (supabase.rpc as any)("is_super_admin", { _user_id: userId });
  if (!superAdmin) {
    const { data: acc } = await supabase
      .from("user_program_access")
      .select("role")
      .eq("user_id", userId)
      .eq("program_id", company.program_id)
      .in("role", ["admin", "manager"])
      .limit(1);
    if (!(acc ?? []).length) throw new Error("Solo administradores o managers del programa pueden hacer esto.");
  }
  return company as { id: string; program_id: string; legal_name: string };
}

export const refreshGroupCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase.rpc as any)("refresh_group_charge", { _company_id: data.company_id });
    if (error) throw new Error(error.message);
    return (res ?? {}) as any;
  });

export const setGroupBillingMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), billing_mode: z.enum(["company", "individual"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertGroupWriter(supabase, userId, data.company_id);
    const { error } = await (supabase.from("companies") as any)
      .update({ billing_mode: data.billing_mode })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    const { error: rErr } = await (supabase.rpc as any)("refresh_group_charge", { _company_id: data.company_id });
    if (rErr) throw new Error(rErr.message);
    await supabase.from("audit_log").insert({
      user_id: userId,
      entity_type: "company",
      entity_id: data.company_id,
      action: "billing_mode_change",
      diff: { billing_mode: data.billing_mode },
    } as any);
    return { ok: true };
  });

/** Baja desde plantilla del grupo: la póliza pasa a cancelada; el cliente no se borra. */
export const cancelGroupMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), policy_ids: z.array(z.string().uuid()).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company = await assertGroupWriter(supabase, userId, data.company_id);
    if (!data.policy_ids.length) return { cancelled: 0 };
    const { data: pols, error } = await supabase
      .from("policies")
      .update({ status: "cancelled" })
      .in("id", data.policy_ids)
      .eq("company_id", data.company_id)
      .select("id");
    if (error) throw new Error(error.message);
    const ids = (pols ?? []).map((p: any) => p.id);
    if (ids.length) {
      await supabase.from("audit_log").insert(
        ids.map((id: string) => ({
          user_id: userId,
          program_id: company.program_id,
          entity_type: "policy",
          entity_id: id,
          action: "cancel",
          diff: { status: "cancelled", note: "Baja desde plantilla del grupo", company_id: data.company_id },
        })) as any,
      );
    }
    return { cancelled: ids.length };
  });

export const markGroupPaymentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        payment_id: z.string().uuid(),
        paid_amount: z.number().positive(),
        paid_at: z.string(),
        method: z.enum(["bank_reference", "bank_transfer", "cash", "card", "oxxo", "manual"]),
        reference: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertGroupWriter(supabase, userId, data.company_id);
    const { data: res, error } = await supabase.rpc("mark_payment_paid", {
      _payment_id: data.payment_id,
      _paid_amount: data.paid_amount,
      _paid_at: data.paid_at,
      _method: data.method,
      _reference: data.reference ?? "",
      _notes: data.notes ?? "Pago del grupo registrado desde la ficha",
      _amount_change_reason: "",
    });
    if (error) throw new Error(error.message);
    return res as any;
  });
