// Generador de la "Carta Aviso de Accidente" (HIR Seguros) para el portal.
// Devuelve el PDF en base64 usando pdf-lib para evitar WebAssembly en preview/producción.

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
    let token: string | null = null;
    try {
      const h = getRequestHeader("x-portal-token");
      if (h && h.length >= 32) token = h;
    } catch {}
    if (!token) {
      try {
        token = getCookie(COOKIE) ?? null;
      } catch {}
    }
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

    const { renderAccidentNoticeWithPdfLib } = await import("@/lib/pdf/pdf-lib-renderers.server");
    const bytes = await renderAccidentNoticeWithPdfLib({
      incident,
      policy,
      client,
      program,
      deductibleOverride: data.deductible ?? null,
    });
    const b64 = Buffer.from(bytes).toString("base64");
    return {
      pdf_base64: b64,
      filename: `Aviso-Accidente-${policy.folio ?? "SIN-FOLIO"}.pdf`,
    };
  });
