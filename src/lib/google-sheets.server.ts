// Server-only Google Sheets helpers. Uses jose + fetch (no googleapis SDK)
// to keep the bundle tiny and Worker-compatible.
import { SignJWT, importPKCS8 } from "jose";

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

interface TokenCacheEntry {
  token: string;
  exp: number;
}
const tokenCache = new Map<string, TokenCacheEntry>();

export async function getAccessToken(creds: ServiceAccountJSON): Promise<string> {
  const cacheKey = creds.client_email;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp > now + 60) return cached.token;

  const tokenUri = creds.token_uri ?? "https://oauth2.googleapis.com/token";
  const scope = "https://www.googleapis.com/auth/spreadsheets.readonly";
  const pk = await importPKCS8(creds.private_key, "RS256");
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.client_email)
    .setSubject(creds.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, { token: json.access_token, exp: now + json.expires_in });
  return json.access_token;
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
    const token = await getAccessToken(creds);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}?fields=properties.title,sheets.properties.title,sheets.properties.gridProperties.rowCount`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const txt = await res.text();
      let code: SheetProbeResult["error_code"] = "other";
      if (res.status === 404) code = "not_found";
      else if (res.status === 403) code = "forbidden";
      else if (res.status === 401) code = "auth";
      return { sheet_id, program, ok: false, error: `${res.status}: ${txt}`, error_code: code };
    }
    const meta = (await res.json()) as {
      properties?: { title?: string };
      sheets?: Array<{ properties?: { title?: string; gridProperties?: { rowCount?: number } } }>;
    };
    const found = meta.sheets?.find(
      (s) => s.properties?.title?.trim().toLowerCase() === tab.trim().toLowerCase(),
    );
    return {
      sheet_id,
      program,
      ok: true,
      title: meta.properties?.title,
      tab_found: !!found,
      rows: found?.properties?.gridProperties?.rowCount ?? 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sheet_id, program, ok: false, error: msg, error_code: "other" };
  }
}

export async function fetchSheetValues(
  creds: ServiceAccountJSON,
  sheet_id: string,
  range: string,
): Promise<string[][]> {
  const token = await getAccessToken(creds);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Sheets values error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { values?: unknown[][] };
  return (json.values ?? []).map((row) =>
    row.map((c) => (c == null ? "" : String(c))),
  );
}

// Normalize Spanish header → snake_case key the SQL processor understands
function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Map normalized header to canonical SQL key
const HEADER_MAP: Record<string, string> = {
  folio: "folio",
  no_folio: "folio",
  numero_folio: "folio",
  curp: "curp",
  nombre: "first_name",
  nombres: "first_name",
  nombre_s: "first_name",
  apellido_paterno: "last_name",
  apellidos: "last_name",
  apellido: "last_name",
  email: "email",
  correo: "email",
  correo_electronico: "email",
  telefono: "phone",
  celular: "phone",
  fecha_nacimiento: "date_of_birth",
  fecha_de_nacimiento: "date_of_birth",
  genero: "gender",
  sexo: "gender",
  direccion: "address",
  domicilio: "address",
  vendedor: "vendor",
  asesor: "vendor",
  promotor: "vendor",
  fecha_inicio: "start_date",
  fecha_de_inicio: "start_date",
  vigencia_inicio: "start_date",
  fecha_fin: "end_date",
  fecha_de_fin: "end_date",
  vigencia_fin: "end_date",
  fecha_emision: "issue_date",
  fecha_expedicion: "issue_date",
  suma_asegurada: "sum_insured",
  monto: "sum_insured",
  prima: "premium",
  prima_total: "premium",
  beneficiario_1: "beneficiary_1",
  beneficiario_2: "beneficiary_2",
  beneficiario_3: "beneficiary_3",
  beneficiario_4: "beneficiary_4",
  beneficiario_5: "beneficiary_5",
  beneficiario: "beneficiary_1",
};

export interface NormalizedRow {
  row_number: number;
  hash: string;
  data: Record<string, string>;
}

export async function readAndNormalizeSheet(
  creds: ServiceAccountJSON,
  sheet_id: string,
  tab: string,
): Promise<NormalizedRow[]> {
  const range = `'${tab.replace(/'/g, "''")}'!A1:Z`;
  const values = await fetchSheetValues(creds, sheet_id, range);
  if (values.length < 2) return [];
  const headers = values[0].map(normalizeHeader);
  const out: NormalizedRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.every((c) => !c || !c.trim())) continue;
    const data: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const canonical = HEADER_MAP[h] ?? h;
      const raw = row[idx] ?? "";
      if (raw !== "") data[canonical] = String(raw).trim();
    });
    const concat = headers.map((_, idx) => row[idx] ?? "").join("\u0001");
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(concat));
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    out.push({ row_number: i + 1, hash, data });
  }
  return out;
}
