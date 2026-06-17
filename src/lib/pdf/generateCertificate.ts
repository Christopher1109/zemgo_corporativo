// Public entrypoint to (re)generate the certificate PDF for a policy.
// - Detects the program (ABC / FUTCARE / MCV) and dispatches to the right
//   React-PDF template.
// - Uploads to the `certificates` bucket at {program_code}/{YYYY}/{folio}.pdf.
// - Returns a signed URL valid for 1 year and persists it on
//   policies.certificate_pdf_url.
// - Writes an audit_log entry: action='CERTIFICATE_PDF_GENERATED'.
//
// Templates are not wired yet. Each program returns a placeholder document
// with the real data so the upload/storage/audit pipeline can be validated
// end-to-end while we wait for the final HTML templates.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderPdfToBytes } from "./render";
import { SmokeTestDoc } from "./templates/SmokeTest";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

function dispatchTemplate(programCode: string, data: CertificateData) {
  // TODO: replace with CertificateABC / CertificateFutCare / CertificateMCV
  // when the HTML templates are translated.
  const code = (programCode ?? "").toUpperCase();
  void data;
  return <SmokeTestDoc label={`${code} — ${data.policy.folio}`} />;
}

export interface CertificateData {
  policy: {
    id: string;
    folio: string;
    policy_number: string | null;
    certificate_number: string | null;
    issue_date: string | null;
    start_date: string | null;
    end_date: string | null;
    contracting_party: string | null;
    premium: number | string | null;
    sum_insured: number | string | null;
    deductible: number | string | null;
    program_id: string;
  };
  program: { name: string; code: string };
  client: Record<string, any>;
  beneficiaries: Array<Record<string, any>>;
  dependents: Array<Record<string, any>>;
  coverages: Array<Record<string, any>>;
}

export const generateCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ policy_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Fetch with RLS to verify the caller can access this policy.
    const { data: pol, error } = await supabase
      .from("policies")
      .select(
        "id, folio, policy_number, certificate_number, issue_date, start_date, end_date, contracting_party, premium, sum_insured, deductible, program_id, " +
          "programs(name, code), " +
          "clients(*), " +
          "beneficiaries(full_name, relationship, percentage), " +
          "dependents(full_name, relationship, date_of_birth, gender)",
      )
      .eq("id", data.policy_id)
      .single();
    if (error) throw new Error(error.message);

    const program = (pol as any).programs as { name: string; code: string };
    const programCode = (program?.code ?? "").toUpperCase();

    // Program coverages snapshot.
    const { data: coverages } = await supabase
      .from("program_coverages")
      .select("*")
      .eq("program_id", (pol as any).program_id);

    const payload: CertificateData = {
      policy: {
        id: pol.id,
        folio: pol.folio,
        policy_number: pol.policy_number,
        certificate_number: pol.certificate_number,
        issue_date: pol.issue_date,
        start_date: pol.start_date,
        end_date: pol.end_date,
        contracting_party: pol.contracting_party,
        premium: pol.premium,
        sum_insured: pol.sum_insured,
        deductible: pol.deductible,
        program_id: pol.program_id,
      },
      program,
      client: (pol as any).clients ?? {},
      beneficiaries: (pol as any).beneficiaries ?? [],
      dependents: (pol as any).dependents ?? [],
      coverages: coverages ?? [],
    };

    // 2) Render PDF.
    const bytes = await renderPdfToBytes(dispatchTemplate(programCode, payload));

    // 3) Upload via service role (RLS-bypass) to the canonical path.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const year = new Date().getUTCFullYear();
    const path = `${programCode || "GEN"}/${year}/${pol.folio}.pdf`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("certificates")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("certificates")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (sErr) throw sErr;

    // 4) Persist URL on policy.
    const { error: updErr } = await supabase
      .from("policies")
      .update({ certificate_pdf_url: signed.signedUrl })
      .eq("id", pol.id);
    if (updErr) throw new Error(updErr.message);

    // 5) Audit.
    await supabase.from("audit_log").insert({
      user_id: userId,
      program_id: pol.program_id,
      entity_type: "policy",
      entity_id: pol.id,
      action: "CERTIFICATE_PDF_GENERATED",
      diff: { path, program_code: programCode, bytes: bytes.byteLength },
    });

    return { url: signed.signedUrl, path, program_code: programCode };
  });
