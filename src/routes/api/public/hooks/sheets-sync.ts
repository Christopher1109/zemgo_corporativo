import { createFileRoute } from "@tanstack/react-router";

interface SheetCfg {
  sheet_id: string;
  program: string;
  tab: string;
}

interface SyncResult {
  sheet_id: string;
  program: string;
  log_id?: string;
  detected: number;
  new: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
}

async function syncOne(
  supabaseAdmin: any,
  creds: any,
  cfg: SheetCfg,
): Promise<SyncResult> {
  const { readAndNormalizeSheet } = await import("@/lib/google-sheets.server");
  const result: SyncResult = {
    sheet_id: cfg.sheet_id,
    program: cfg.program,
    detected: 0,
    new: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
  const { data: logId, error: startErr } = await supabaseAdmin.rpc("start_sheet_sync", {
    _sheet_id: cfg.sheet_id,
    _program: cfg.program,
  });
  if (startErr) {
    result.error = `start_sheet_sync: ${startErr.message}`;
    return result;
  }
  result.log_id = logId as string;
  try {
    const rows = await readAndNormalizeSheet(creds, cfg.sheet_id, cfg.tab);
    result.detected = rows.length;
    for (const r of rows) {
      const { data: res, error } = await supabaseAdmin.rpc("process_sheet_row", {
        _sheet_id: cfg.sheet_id,
        _program: cfg.program,
        _row_number: r.row_number,
        _row_hash: r.hash,
        _row_data: r.data,
      });
      if (error) {
        result.failed++;
        continue;
      }
      const action = (res as { action?: string })?.action;
      if (action === "synced_new") result.new++;
      else if (action === "synced_updated") result.updated++;
      else if (action === "failed") result.failed++;
      else result.skipped++;
    }
    await supabaseAdmin.rpc("finish_sheet_sync", {
      _log_id: logId,
      _detected: result.detected,
      _new: result.new,
      _updated: result.updated,
      _skipped: result.skipped,
      _failed: result.failed,
      _error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    await supabaseAdmin.rpc("finish_sheet_sync", {
      _log_id: logId,
      _detected: result.detected,
      _new: result.new,
      _updated: result.updated,
      _skipped: result.skipped,
      _failed: result.failed,
      _error: msg,
    });
  }
  return result;
}

export const Route = createFileRoute("/api/public/hooks/sheets-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Read which sheets to sync (body.sheet_id optional filter)
          let bodyJson: { sheet_id?: string } = {};
          try {
            bodyJson = (await request.json()) as { sheet_id?: string };
          } catch {
            /* empty body ok */
          }

          const { data: cfg, error: cfgErr } = await supabaseAdmin
            .from("system_config")
            .select("key, value")
            .in("key", ["google_sheets.enabled", "google_sheets.sheets"]);
          if (cfgErr) throw new Error(cfgErr.message);

          const enabled =
            cfg?.find((c: any) => c.key === "google_sheets.enabled")?.value === true;
          if (!enabled) {
            return Response.json({ ok: false, reason: "disabled" });
          }
          const allSheets = (cfg?.find((c: any) => c.key === "google_sheets.sheets")
            ?.value ?? []) as SheetCfg[];
          const sheets = bodyJson.sheet_id
            ? allSheets.filter((s) => s.sheet_id === bodyJson.sheet_id)
            : allSheets;

          const { data: creds, error: credErr } = await supabaseAdmin.rpc(
            "get_google_sheets_credentials",
          );
          if (credErr) throw new Error(credErr.message);
          if (!creds) throw new Error("No credentials configured");

          const results: SyncResult[] = [];
          for (const s of sheets) {
            results.push(await syncOne(supabaseAdmin, creds as any, s));
          }
          return Response.json({ ok: true, results });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("sheets-sync error", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => new Response("sheets-sync — POST only", { status: 200 }),
    },
  },
});
