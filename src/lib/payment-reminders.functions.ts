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
      .select("*")
      .order("due_date", { ascending: true })
      .limit(500);
    if (data?.program_id) q = q.eq("program_id", data.program_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
