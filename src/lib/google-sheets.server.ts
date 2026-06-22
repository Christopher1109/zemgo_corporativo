// Server-only Google Sheets helpers. Never import from client/route modules
// outside a createServerFn handler (filename .server.ts blocks client bundles).
import { google } from "googleapis";

export interface ServiceAccountJSON {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  token_uri?: string;
  [k: string]: unknown;
}

export function buildSheetsClient(creds: ServiceAccountJSON) {
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth: jwt });
}

export interface SheetProbeResult {
  sheet_id: string;
  program: string;
  ok: boolean;
  title?: string;
  tab_found?: boolean;
  rows?: number;
  error?: string;
  error_code?: "not_found" | "forbidden" | "auth" | "other";
}

export async function probeSheet(
  creds: ServiceAccountJSON,
  sheet_id: string,
  program: string,
  tab: string,
): Promise<SheetProbeResult> {
  try {
    const client = buildSheetsClient(creds);
    const meta = await client.spreadsheets.get({
      spreadsheetId: sheet_id,
      fields: "properties.title,sheets.properties.title,sheets.properties.gridProperties.rowCount",
    });
    const title = meta.data.properties?.title ?? undefined;
    const found = meta.data.sheets?.find(
      (s) => s.properties?.title?.trim().toLowerCase() === tab.trim().toLowerCase(),
    );
    return {
      sheet_id,
      program,
      ok: true,
      title,
      tab_found: !!found,
      rows: found?.properties?.gridProperties?.rowCount ?? 0,
    };
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    let code: SheetProbeResult["error_code"] = "other";
    if (err.code === 404) code = "not_found";
    else if (err.code === 403) code = "forbidden";
    else if (err.code === 401) code = "auth";
    return {
      sheet_id,
      program,
      ok: false,
      error: err.message ?? "unknown",
      error_code: code,
    };
  }
}
