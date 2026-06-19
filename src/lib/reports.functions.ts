// Server functions for the reports module.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REPORT_QUERIES } from "@/lib/reports/queries.server";
import { toCSV, toXLSX, toPDF, uploadReport } from "@/lib/reports/exporters.server";
import { REPORT_SPECS } from "@/lib/reports/types";

export const listReportTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("report_templates").select("code, name, description, admin_only, sort_order").order("sort_order");
    if (error) throw new Error(error.message);
    const { data: isAdmin } = await context.supabase.rpc("is_super_admin" as any, { _user_id: context.userId });
    return (data ?? []).filter((t: any) => !t.admin_only || !!isAdmin);
  });

const generateInput = z.object({
  report_code: z.string(),
  format: z.enum(["csv", "xlsx", "pdf"]),
  filters: z.record(z.any()).default({}),
});

export const generateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateInput.parse(d))
  .handler(async ({ data, context }) => {
    const spec = REPORT_SPECS[data.report_code];
    if (!spec) throw new Error("unknown_report");
    if (!spec.implemented) throw new Error("report_not_implemented_yet");
    if (spec.admin_only) {
      const { data: isAdmin } = await context.supabase.rpc("is_super_admin" as any, { _user_id: context.userId });
      if (!isAdmin) throw new Error("forbidden");
    }
    const queryFn = REPORT_QUERIES[data.report_code];
    if (!queryFn) throw new Error("query_not_registered");
    const result = await queryFn(context.supabase, data.filters);
    let rows = result.rows;
    let warning: string | null = null;
    if (spec.max_rows && rows.length >= spec.max_rows) {
      warning = `Resultado limitado a ${spec.max_rows} filas; refina los filtros para ver más.`;
      rows = rows.slice(0, spec.max_rows);
    }

    const { data: profile } = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).single();
    const by = profile?.full_name ?? "Usuario";

    let bytes: Uint8Array;
    if (data.format === "csv") bytes = toCSV(spec, rows);
    else if (data.format === "xlsx") bytes = await toXLSX(spec, rows, data.filters, by, result.kpis);
    else bytes = await toPDF(spec, rows, data.filters, by, result.kpis);

    const { path, signedUrl } = await uploadReport(context.userId, data.report_code, data.format, bytes);

    await context.supabase.from("audit_log").insert({
      user_id: context.userId,
      program_id: data.filters?.program_id && data.filters.program_id !== "all" ? data.filters.program_id : null,
      entity_type: "report", action: "REPORT_GENERATED",
      diff: { report_code: data.report_code, format: data.format, filters: data.filters, rows_count: rows.length, file_path: path },
    });
    return { url: signedUrl, path, rows_count: rows.length, format: data.format, warning };
  });

// Preview rows (no export) — used for renovaciones inline actions
export const previewReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    report_code: z.string(), filters: z.record(z.any()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const spec = REPORT_SPECS[data.report_code];
    if (!spec || !spec.implemented) throw new Error("unknown_report");
    if (spec.admin_only) {
      const { data: isAdmin } = await context.supabase.rpc("is_super_admin" as any, { _user_id: context.userId });
      if (!isAdmin) throw new Error("forbidden");
    }
    const queryFn = REPORT_QUERIES[data.report_code];
    if (!queryFn) throw new Error("query_not_registered");
    const result = await queryFn(context.supabase, data.filters);
    return { rows: result.rows.slice(0, 500), kpis: result.kpis ?? null, total: result.rows.length };
  });

// Filter helpers: list users / actions for the actividad report
export const listAuditMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_super_admin" as any, { _user_id: context.userId });
    if (!isAdmin) throw new Error("forbidden");
    const [users, actions] = await Promise.all([
      context.supabase.from("profiles").select("id, full_name").order("full_name"),
      context.supabase.from("audit_log").select("action").limit(1000),
    ]);
    const uniqActions = Array.from(new Set((actions.data ?? []).map((a: any) => a.action))).sort();
    return { users: users.data ?? [], actions: uniqActions };
  });

// Sales reps for the ventas filter
export const listSalesReps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("sales_reps").select("id, full_name, referral_source").eq("is_active", true).order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Mark contacted for renovations
export const markRenewalContacted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ policy_id: z.string().uuid(), notes: z.string().optional().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("log_renewal_contact" as any, {
      _policy_id: data.policy_id, _notes: data.notes,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

// Presets
export const listPresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ report_code: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("saved_report_filters")
      .select("id, name, filters_json, created_at").eq("user_id", context.userId)
      .eq("report_code", data.report_code).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const savePreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ report_code: z.string(), name: z.string().min(1), filters: z.record(z.any()) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("saved_report_filters").insert({
      user_id: context.userId, report_code: data.report_code, name: data.name, filters_json: data.filters,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("saved_report_filters").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
