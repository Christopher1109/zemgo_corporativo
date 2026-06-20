// Server functions for the Customer Portal.
// Auth model: CURP + 6-digit code → opaque session token stored in httpOnly cookie.
// Cookie name: portal_token. All RPCs are SECURITY DEFINER and validate the token internally.

import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestHeader,
  getRequestIP,
} from "@tanstack/react-start/server";

const COOKIE = "portal_token";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function getToken(): string | null {
  try {
    const t = getCookie(COOKIE);
    return t ?? null;
  } catch {
    return null;
  }
}

function getPortalCookieOptions(maxAge?: number) {
  let host = "";
  try { host = getRequestHeader("host") ?? ""; } catch {}
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  return {
    httpOnly: true,
    secure: !isLocal,
    sameSite: isLocal ? "lax" as const : "none" as const,
    path: "/",
    ...(maxAge ? { maxAge } : {}),
  };
}

// ---------------- Auth ----------------

export const requestPortalAccess = createServerFn({ method: "POST" })
  .inputValidator((d: { curp: string; full_name: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: res, error } = await sb.rpc("request_portal_access", {
      _curp: data.curp.trim().toUpperCase(),
      _full_name: data.full_name.trim(),
    });
    if (error) throw new Error(error.message);
    return res as { client_id: string; first_name: string; qa_mode: boolean; dev_code: string | null };
  });

export const verifyPortalCode = createServerFn({ method: "POST" })
  .inputValidator((d: { client_id: string; code: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    let ip = "";
    try { ip = getRequestIP({ xForwardedFor: true }) ?? ""; } catch {}
    let ua = "";
    try { ua = getRequestHeader("user-agent") ?? ""; } catch {}
    const { data: res, error } = await sb.rpc("verify_portal_code", {
      _client_id: data.client_id,
      _code: data.code,
      _ip: ip,
      _ua: ua,
    });
    if (error) throw new Error(error.message);
    const token = (res as { token: string }).token;
    setCookie(COOKIE, token, getPortalCookieOptions(60 * 60 * 24));
    return { ok: true };
  });

export const portalLogout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getToken();
  if (token) {
    const sb = await admin();
    await sb.rpc("revoke_portal_session", { _token: token });
  }
  deleteCookie(COOKIE, getPortalCookieOptions());
  return { ok: true };
});

// ---------------- Data ----------------

async function callPortal(fn: string, extra: Record<string, unknown> = {}): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("sesion_invalida");
  const sb = await admin();
  const { data, error } = await sb.rpc(fn as any, { _token: token, ...extra });
  if (error) throw new Error(error.message);
  return data;
}

export const portalDashboard = createServerFn({ method: "GET" }).handler(async () => {
  return (await callPortal("get_portal_dashboard")) as any;
});
export const portalPolicies = createServerFn({ method: "GET" }).handler(async () => {
  return (await callPortal("get_portal_policies")) as any;
});
export const portalPayments = createServerFn({ method: "GET" }).handler(async () => {
  return (await callPortal("get_portal_payments")) as any;
});
export const portalIncidents = createServerFn({ method: "GET" }).handler(async () => {
  return (await callPortal("get_portal_incidents")) as any;
});

export const portalReportIncident = createServerFn({ method: "POST" })
  .inputValidator((d: {
    policy_id: string;
    accident_date: string;
    accident_time: string | null;
    location: string;
    description: string;
    hospital: string;
  }) => d)
  .handler(async ({ data }) => {
    const id = (await callPortal("report_portal_incident", {
      _policy_id: data.policy_id,
      _accident_date: data.accident_date,
      _accident_time: data.accident_time,
      _location: data.location,
      _description: data.description,
      _hospital: data.hospital,
    })) as string;
    return { id };
  });

export const portalUpdateProfile = createServerFn({ method: "POST" })
  .inputValidator((d: { changes: Record<string, string> }) => d)
  .handler(async ({ data }) => callPortal("update_portal_profile", { _changes: data.changes }));

export const portalGenerateBankReference = createServerFn({ method: "POST" })
  .inputValidator((d: { payment_id: string }) => d)
  .handler(async ({ data }) => {
    const token = getToken();
    if (!token) throw new Error("sesion_invalida");
    const sb = await admin();
    // Validate ownership: payment → policy.client_id must match session client_id
    const { data: clientId, error: e0 } = await sb.rpc("resolve_portal_session", { _token: token });
    if (e0) throw new Error(e0.message);
    if (!clientId) throw new Error("sesion_invalida");
    const { data: pay, error: e1 } = await sb
      .from("payments")
      .select("id, policy_id, policies!inner(client_id)")
      .eq("id", data.payment_id)
      .single();
    if (e1 || !pay) throw new Error("pago_no_encontrado");
    const policies = (pay as any).policies;
    const ownerId = Array.isArray(policies) ? policies[0]?.client_id : policies?.client_id;
    if (ownerId !== clientId) throw new Error("no_autorizado");
    const { data: ref, error } = await sb.rpc("generate_bank_reference", { _payment_id: data.payment_id });
    if (error) throw new Error(error.message);
    return ref as { reference: string; expires_at: string; reused: boolean };
  });

export const portalMe = createServerFn({ method: "GET" }).handler(async () => {
  const token = getToken();
  if (!token) return { authenticated: false as const };
  const sb = await admin();
  const { data: cid, error } = await sb.rpc("resolve_portal_session", { _token: token });
  if (error || !cid) return { authenticated: false as const };
  const { data: client } = await sb
    .from("clients")
    .select("id, first_name, last_name, email, phone, street, number, colonia, city, state, zip, curp, date_of_birth, gender")
    .eq("id", cid)
    .single();
  return { authenticated: true as const, client };
});
