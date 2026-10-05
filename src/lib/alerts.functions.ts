import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ program_id: z.string().uuid().nullable().optional() }).optional();

export const getAlertsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const programId: string = data?.program_id || "00000000-0000-0000-0000-000000000000"; // siempre un programa (nunca "todos")
    const sb = context.supabase;

    // Upcoming payments (pending in next 90 days) — fuels payment reminders
    let upcomingQ = sb
      .from("payments")
      .select(
        "id, amount, due_date, status, bank_reference, policies!inner(id, folio, program_id, company_id, programs(code, name, color_primary), clients(first_name, last_name, email, phone, state))"
      )
      .in("status", ["pending", "overdue"])
      // Los certificados de empresa no se cobran uno por uno: se cobran a la empresa (company_charges).
      .is("policies.company_id", null)
      .lte("due_date", new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
      .order("due_date", { ascending: true })
      .limit(200);
    if (programId) upcomingQ = upcomingQ.eq("policies.program_id", programId);
    const upcoming = await upcomingQ;
    if (upcoming.error) throw new Error(upcoming.error.message);

    // Renewals: policies ending in next 90 days
    let renewQ = sb
      .from("policies")
      .select("id, folio, end_date, status, premium, program_id, programs(code, name, color_primary), clients(first_name, last_name, email, phone, state)")
      .eq("status", "active")
      .is("company_id", null)
      .lte("end_date", new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
      .gte("end_date", new Date().toISOString().slice(0, 10))
      .order("end_date", { ascending: true })
      .limit(200);
    if (programId) renewQ = renewQ.eq("program_id", programId);
    const renewals = await renewQ;
    if (renewals.error) throw new Error(renewals.error.message);

    // Suspended policies
    let suspQ = sb
      .from("policies")
      .select("id, folio, end_date, premium, program_id, programs(code, name, color_primary), clients(first_name, last_name, email, phone)")
      .eq("status", "suspended")
      .is("company_id", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (programId) suspQ = suspQ.eq("program_id", programId);
    const suspended = await suspQ;
    if (suspended.error) throw new Error(suspended.error.message);

    // Cobros consolidados a empresas (uno por empresa por mes)
    let chargesQ = (sb as any)
      .from("company_charges")
      .select("id, company_id, program_id, period, due_date, amount, insured_count, unit_price, status, companies(legal_name, contact_name, email, phone), programs(code, name, color_primary)")
      .in("status", ["pending", "overdue"])
      .lte("due_date", new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
      .order("due_date", { ascending: true });
    if (programId) chargesQ = chargesQ.eq("program_id", programId);
    const charges = await chargesQ;
    if (charges.error) throw new Error(charges.error.message);

    // Renovaciones de certificados de empresa (fin de vigencia en los próximos 90 días), agrupadas por empresa y fecha.
    let compRenQ = sb
      .from("policies")
      .select("company_id, end_date, companies(legal_name)")
      .eq("status", "active")
      .not("company_id", "is", null)
      .lte("end_date", new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
      .gte("end_date", new Date().toISOString().slice(0, 10))
      .limit(5000);
    if (programId) compRenQ = compRenQ.eq("program_id", programId);
    const compRen = await compRenQ;
    if (compRen.error) throw new Error(compRen.error.message);
    const groups = new Map<string, { company_id: string; legal_name: string; end_date: string; count: number }>();
    for (const r of (compRen.data ?? []) as any[]) {
      const k = `${r.company_id}|${r.end_date}`;
      const g = groups.get(k) ?? { company_id: r.company_id, legal_name: r.companies?.legal_name ?? "Empresa", end_date: r.end_date, count: 0 };
      g.count++;
      groups.set(k, g);
    }

    return {
      companyRenewals: [...groups.values()].sort((a, b) => a.end_date.localeCompare(b.end_date)),
      companyCharges: (charges.data ?? []) as any[],
      upcoming: upcoming.data ?? [],
      renewals: renewals.data ?? [],
      suspended: suspended.data ?? [],
    };
  });
