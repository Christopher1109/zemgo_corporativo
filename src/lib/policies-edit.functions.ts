// Server functions for policy edit / renew / renewal-contact.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updatePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    policy_id: z.string().uuid(),
    changes: z.record(z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("update_policy" as any, {
      _policy_id: data.policy_id, _changes: data.changes,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const renewPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    source_policy_id: z.string().uuid(),
    overrides: z.record(z.any()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("renew_policy" as any, {
      _source_id: data.source_policy_id, _overrides: data.overrides,
    });
    if (error) throw new Error(error.message);
    return res;
  });

export const listPolicyRevisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ policy_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("policy_revisions")
      .select("id, edited_at, edited_by, fields_changed")
      .eq("policy_id", data.policy_id)
      .order("edited_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).map((r: any) => r.edited_by).filter(Boolean))];
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, full_name").in("id", ids as string[]);
      names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      profiles: r.edited_by ? { full_name: names[r.edited_by] ?? null } : null,
    }));
  });
