import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ program_id: z.string().uuid().nullable().optional() }).optional();

export const getPaymentReminderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb
      .from("payment_reminder_status")
      .select("*, policies!inner(company_id)")
      .is("policies.company_id", null) // los de empresa se cobran a la empresa, sin recordatorio por persona
      .order("due_date", { ascending: true })
      .limit(500);
    q = q.eq("program_id", data?.program_id || "00000000-0000-0000-0000-000000000000"); // siempre un programa
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
