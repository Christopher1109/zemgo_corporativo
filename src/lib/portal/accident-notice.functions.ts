// Generador de la "Carta Aviso de Accidente" (HIR Seguros) para el portal.
// Devuelve el PDF en base64 usando la plantilla React-PDF `MedicalPassHIR`.

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

const COOKIE = "portal_token";

function getToken(): string | null {
  try {
    const h = getRequestHeader("x-portal-token");
    if (h && h.length >= 32) return h;
  } catch {}
  try {
    return getCookie(COOKIE) ?? null;
  } catch {
    return null;
  }
}

const inputSchema = z.object({
  incident_id: z.string().uuid(),
  // Datos que el usuario captura al reportar (persistidos en incidents),
  // pero permitimos overrides opcionales al momento de imprimir la carta.
  deductible: z.union([z.number(), z.string()]).optional().nullable(),
});

export const portalAccidentNotice = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const token = getToken();
    if (!token) throw new Error("sesion_invalida");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await (supabaseAdmin.rpc as any)(
      "get_portal_accident_notice",
      { _token: token, _incident_id: data.incident_id },
    );
    if (error) throw new Error(error.message);
    if (!payload) throw new Error("siniestro_no_encontrado");

    const { incident, policy, client, program } = payload as {
      incident: {
        accident_date?: string;
        accident_time?: string;
        description?: string;
        hospital?: string;
      };
      policy: {
        folio?: string;
        policy_number?: string | null;
        certificate_number?: string | null;
        contracting_party?: string | null;
        sum_insured?: number | string | null;
        deductible?: number | string | null;
      };
      client: { full_name?: string; curp?: string; date_of_birth?: string };
      program: { code?: string; name?: string; policy_number?: string | null };
    };

    const { MedicalPassHIR } = await import("@/lib/pdf/templates/MedicalPassHIR");
    const { renderPdfToBytes } = await import("@/lib/pdf/render");
    const React = (await import("react")).default;

    const doc = React.createElement(MedicalPassHIR, {
      director_name: "Graciela Rivera Bersoza",
      director_signature_url: null,
      snapshot: {
        program_code: program?.code,
        contracting_party: policy.contracting_party ?? client.full_name ?? "",
        // Nº de póliza global del programa (editable en Configuración)
        policy_number: program?.policy_number ?? policy.policy_number ?? "",
        certificate_number: policy.certificate_number ?? policy.folio ?? "",
        insured_name: client.full_name ?? "",
        date_of_birth: client.date_of_birth ?? null,
        curp: client.curp ?? "",
        sum_insured: policy.sum_insured ?? null,
        deductible: data.deductible ?? policy.deductible ?? null,
        incident_date: incident.accident_date ?? null,
        incident_time: incident.accident_time
          ? String(incident.accident_time).slice(0, 5)
          : null,
        incident_description: incident.description ?? "",
        hospital_name: incident.hospital ?? "",
      },
    });

    const bytes = await renderPdfToBytes(doc as any);
    const b64 = Buffer.from(bytes).toString("base64");
    return {
      pdf_base64: b64,
      filename: `Aviso-Accidente-${policy.folio ?? "SIN-FOLIO"}.pdf`,
    };
  });
