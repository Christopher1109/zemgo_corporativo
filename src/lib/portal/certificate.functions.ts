import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const portalCertificatePdf = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ policy_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getRequestHeader, getCookie } = await import("@tanstack/react-start/server");
    let token: string | null = null;
    try {
      const h = getRequestHeader("x-portal-token");
      if (h && h.length >= 32) token = h;
    } catch {}
    if (!token) {
      try {
        token = getCookie("portal_token") ?? null;
      } catch {}
    }
    if (!token) throw new Error("sesion_invalida");


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clientId, error: sessionError } = await supabaseAdmin.rpc("resolve_portal_session", { _token: token });
    if (sessionError) throw new Error(sessionError.message);
    if (!clientId) throw new Error("sesion_invalida");

    const { data: polRaw, error } = await supabaseAdmin
      .from("policies")
      .select(
        "id, folio, policy_number, certificate_number, issue_date, start_date, end_date, contracting_party, premium, sum_insured, deductible, program_id, " +
          "programs(name, code, color_primary, policy_number), " +
          "clients(first_name, last_name, curp, date_of_birth, gender, phone, email), " +
          "beneficiaries(full_name, relationship, percentage)",
      )
      .eq("id", data.policy_id)
      .eq("client_id", clientId as string)
      .single();
    if (error) throw new Error("certificado_no_encontrado");

    const pol = polRaw as any;
    const { renderCertificateWithPdfLib } = await import("@/lib/pdf/pdf-lib-renderers.server");
    const bytes = await renderCertificateWithPdfLib({
      policy: {
        ...pol,
        policy_number: pol.programs?.policy_number ?? pol.policy_number,
        certificate_number: pol.certificate_number ?? pol.folio,
      },
      program: pol.programs,
      client: pol.clients,
      beneficiaries: pol.beneficiaries ?? [],
    });

    return {
      pdf_base64: Buffer.from(bytes).toString("base64"),
      filename: `Certificado-${pol.folio ?? "SIN-FOLIO"}.pdf`,
    };
  });