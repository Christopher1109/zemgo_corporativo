import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sheetConfigSchema = z.object({
  program: z.string(),
  sheet_id: z.string(),
  tab: z.string(),
});
export type SheetConfig = z.infer<typeof sheetConfigSchema>;


export const getGoogleSheetsConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: meta, error: metaErr } = await supabase.rpc(
      "get_google_sheets_credentials_meta",
    );
    if (metaErr) throw new Error(metaErr.message);
    const { data: cfg, error: cfgErr } = await supabase
      .from("system_config")
      .select("key, value")
      .in("key", ["google_sheets.enabled", "google_sheets.sheets"]);
    if (cfgErr) throw new Error(cfgErr.message);
    const enabled = cfg?.find((c) => c.key === "google_sheets.enabled")?.value === true;
    const rawSheets = cfg?.find((c) => c.key === "google_sheets.sheets")?.value ?? [];
    const sheets = z.array(sheetConfigSchema).parse(rawSheets);
    return {
      credentials: meta ?? { configured: false },
      enabled,
      sheets,
    };
  });

export const saveGoogleSheetsCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        service_account_json: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data.service_account_json);
    } catch {
      throw new Error("El JSON no es válido. Verifica que pegaste el archivo completo.");
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("El JSON no contiene client_email/private_key. ¿Es una cuenta de servicio?");
    }
    const { error } = await context.supabase.rpc("save_google_sheets_credentials", {
      _json: parsed as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, client_email: parsed.client_email as string };
  });

export const setGoogleSheetsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("system_config")
      .upsert({ key: "google_sheets.enabled", value: data.enabled });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testGoogleSheetsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: creds, error } = await context.supabase.rpc(
      "get_google_sheets_credentials",
    );
    if (error) throw new Error(error.message);
    if (!creds) throw new Error("No hay credenciales configuradas.");
    const { data: cfg } = await context.supabase
      .from("system_config")
      .select("value")
      .eq("key", "google_sheets.sheets")
      .single();
    const sheets = z.array(sheetConfigSchema).parse(cfg?.value ?? []);
    const { probeSheet } = await import("./google-sheets.server");
    const results = await Promise.all(
      sheets.map((s) =>
        probeSheet(creds as never, s.sheet_id, s.program, s.tab),
      ),
    );
    return { results };
  });

export const listSheetSyncLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sheet_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Trigger sync now: super-admins only. Calls the public hook same-origin.
export const runGoogleSheetsSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sheet_id: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_super_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("forbidden");
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const host = getRequestHost();
    const proto = host.startsWith("localhost") ? "http" : "https";
    const url = `${proto}://${host}/api/public/hooks/sheets-sync`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data.sheet_id ? { sheet_id: data.sheet_id } : {}),
    });
    const json = await res.json();
    return json as { ok: boolean; results?: unknown; error?: string };
  });

