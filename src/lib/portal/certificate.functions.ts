// Certificate PDF flow for the customer portal (portal_token auth).
// Mirrors src/lib/certificate.functions.ts but uses the portal session
// instead of the Supabase user bearer, so the asegurado can download the
// same React-PDF templates that the admin generates.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function resolvePortalClientId(): Promise<{ clientId: string }> {
  const { getRequestHeader, getCookie } = await import("@tanstack/react-start/server");
  let token: string | null = null;
  try {
    const h = getRequestHeader("x-portal-token");
    if (h && h.length >= 32) token = h;
  } catch {}
  if (!token) {
    try { token = getCookie("portal_token") ?? null; } catch {}
  }
  if (!token) throw new Error("sesion_invalida");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: clientId, error } = await supabaseAdmin.rpc("resolve_portal_session", { _token: token });
  if (error) throw new Error(error.message);
  if (!clientId) throw new Error("sesion_invalida");
  return { clientId: clientId as string };
}

export const getPortalCertificatePayload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ policy_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { clientId } = await resolvePortalClientId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: polRaw, error } = await supabaseAdmin
      .from("policies")
      .select(
        "id, folio, policy_number, certificate_number, issue_date, start_date, end_date, contracting_party, premium, sum_insured, deductible, program_id, client_id, " +
          "programs(name, code), " +
          "clients(*), " +
          "beneficiaries(full_name, relationship, percentage), " +
          "dependents(full_name, relationship, date_of_birth)",
      )
      .eq("id", data.policy_id)
      .single();
    if (error) throw new Error(error.message);
    const pol = polRaw as any;

    // Solo el propio asegurado puede descargar su certificado.
    if (pol.client_id !== clientId) throw new Error("no_autorizado");

    const program = pol.programs as { name: string; code: string };
    const programCode = (program?.code ?? "").toUpperCase();

    const { data: coverages } = await supabaseAdmin
      .from("program_coverages")
      .select("*")
      .eq("program_id", pol.program_id);

    const structuredDeps = (pol.dependents ?? []) as Array<{ full_name?: string | null; relationship?: string | null }>;
    const clientMeta = (pol.clients?.metadata ?? {}) as { dependents_text?: string };
    const depsForPdf =
      structuredDeps.length === 0 && clientMeta.dependents_text
        ? [{ full_name: clientMeta.dependents_text, relationship: null }]
        : structuredDeps;

    return {
      programCode,
      payload: {
        policy: {
          id: pol.id as string,
          folio: pol.folio as string,
          policy_number: pol.policy_number,
          certificate_number: pol.certificate_number,
          issue_date: pol.issue_date,
          start_date: pol.start_date,
          end_date: pol.end_date,
          contracting_party: pol.contracting_party,
          premium: pol.premium,
          sum_insured: pol.sum_insured,
          deductible: pol.deductible,
          program_id: pol.program_id as string,
        },
        program,
        client: pol.clients ?? {},
        beneficiaries: pol.beneficiaries ?? [],
        dependents: depsForPdf,
        coverages: coverages ?? [],
      },
    };
  });

export const savePortalCertificatePdf = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        policy_id: z.string().uuid(),
        folio: z.string().min(1),
        program_code: z.string().min(1),
        program_id: z.string().uuid(),
        pdf_base64: z.string().min(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { clientId } = await resolvePortalClientId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica ownership antes de subir.
    const { data: pol, error: polErr } = await supabaseAdmin
      .from("policies")
      .select("id, client_id")
      .eq("id", data.policy_id)
      .single();
    if (polErr) throw new Error(polErr.message);
    if (!pol || pol.client_id !== clientId) throw new Error("no_autorizado");

    const bytes = Uint8Array.from(Buffer.from(data.pdf_base64, "base64"));
    const year = new Date().getUTCFullYear();
    const path = `${data.program_code || "GEN"}/${year}/${data.folio}.pdf`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("certificates")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("certificates")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (sErr) throw sErr;

    await supabaseAdmin
      .from("policies")
      .update({ certificate_pdf_url: signed.signedUrl })
      .eq("id", data.policy_id);

    return { url: signed.signedUrl, path };
  });
