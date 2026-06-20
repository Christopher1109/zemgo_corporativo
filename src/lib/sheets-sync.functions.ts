import { createServerFn } from "@tanstack/react-start";

export const syncGoogleSheet = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg } = await supabaseAdmin
    .from("system_config")
    .select("key, value")
    .like("key", "google_sheets.%");
  const enabled = cfg?.find((c) => c.key === "google_sheets.enabled")?.value === true;
  const sheetId = (cfg?.find((c) => c.key === "google_sheets.sheet_id")?.value as string) || "";
  const { data: log } = await supabaseAdmin
    .from("sheet_sync_log")
    .insert({ sheet_id: sheetId || "stub", status: enabled ? "started" : "stub" })
    .select("id")
    .single();
  // stub: nothing to do
  await supabaseAdmin
    .from("sheet_sync_log")
    .update({ ended_at: new Date().toISOString(), status: enabled ? "ok" : "stub", rows_detected: 0, rows_imported: 0, rows_skipped: 0 })
    .eq("id", log?.id ?? "");
  return { ok: true, enabled };
});
