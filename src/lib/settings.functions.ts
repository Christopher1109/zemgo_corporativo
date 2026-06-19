import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProgramAlertConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("programs")
      .select("id, code, name, color_primary, payment_alert_offsets, is_active")
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateProgramAlertOffsets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    program_id: z.string().uuid(),
    offsets: z.array(z.number().int().min(1).max(365)).min(1).max(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("update_program_alert_offsets", {
      _program_id: data.program_id,
      _offsets: data.offsets,
    });
    if (error) throw new Error(error.message);
    return res;
  });
