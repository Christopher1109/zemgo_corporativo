import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPoliciesByState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ program_id: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("get_policies_by_state", {
      _program_id: (data.program_id ?? null) as any,
    });
    if (error) throw new Error(error.message);
    return res ?? [];
  });
