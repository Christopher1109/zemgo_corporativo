import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ program_id: z.string().uuid().nullable().optional() }).optional();

export const getAlertsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const programId = data?.program_id ?? null;
    const sb = context.supabase;

    // Upcoming payments (pending in next 90 days) — fuels payment reminders
    let upcomingQ = sb
      .from("payments")
      .select(
        "id, amount, due_date, status, bank_reference, policies!inner(id, folio, program_id, programs(code, name, color_primary), clients(first_name, last_name, email, phone, state))"
      )
      .in("status", ["pending", "overdue"])
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
      .order("updated_at", { ascending: false })
      .limit(50);
    if (programId) suspQ = suspQ.eq("program_id", programId);
    const suspended = await suspQ;
    if (suspended.error) throw new Error(suspended.error.message);

    return {
      upcoming: upcoming.data ?? [],
      renewals: renewals.data ?? [],
      suspended: suspended.data ?? [],
    };
  });
