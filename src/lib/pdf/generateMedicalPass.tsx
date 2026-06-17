// Public entrypoint to (re)generate the medical pass PDF for an issued pass.
// - Reads the full pass snapshot + director's signature_url.
// - Renders the HIR template (placeholder for now) with React-PDF.
// - Uploads to the `medical-passes` bucket at
//   {program_code}/{YYYY}/{MM}/{pass_id}.pdf.
// - Calls the set_medical_pass_pdf_url RPC (which writes the
//   PASS_PDF_GENERATED audit log entry server-side).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderPdfToBytes } from "./render";
import { MedicalPassHIR } from "./templates/MedicalPassHIR";

export interface MedicalPassData {
  pass_id: string;
  valid_from: string;
  valid_until: string;
  director_name: string | null;
  director_signature_url: string | null;
  snapshot: Record<string, any>;
}

function buildMedicalPassDoc(data: MedicalPassData) {
  return (
    <MedicalPassHIR
      pass_id={data.pass_id}
      valid_from={data.valid_from}
      valid_until={data.valid_until}
      director_name={data.director_name}
      director_signature_url={data.director_signature_url}
      snapshot={data.snapshot as any}
    />
  );
}

export const generateMedicalPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ pass_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // RLS-aware read so the caller must have access to the pass.
    const { data: pass, error } = await supabase
      .from("medical_passes")
      .select(
        "id, valid_from, valid_until, director_name, director_signature_url, snapshot, policy_id",
      )
      .eq("id", data.pass_id)
      .single();
    if (error) throw new Error(error.message);

    const snap = (pass.snapshot ?? {}) as Record<string, any>;
    const programCode = String(snap.program_code ?? "GEN").toUpperCase();

    const bytes = await renderPdfToBytes(
      buildMedicalPassDoc({
        pass_id: pass.id,
        valid_from: pass.valid_from,
        valid_until: pass.valid_until,
        director_name: pass.director_name,
        director_signature_url: pass.director_signature_url,
        snapshot: snap,
      }),
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const path = `${programCode}/${yyyy}/${mm}/${pass.id}.pdf`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("medical-passes")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    // The RPC writes pdf_url + PASS_PDF_GENERATED audit entry under SECURITY DEFINER.
    const { error: setErr } = await (supabase.rpc as any)(
      "set_medical_pass_pdf_url",
      { _pass_id: pass.id, _pdf_url: path },
    );
    if (setErr) throw new Error(setErr.message);

    return { pass_id: pass.id as string, path, program_code: programCode };
  });
