// Public entrypoint to (re)generate the certificate PDF for a policy.
// - Detects program (ABC / FUTCARE / MCV) and dispatches to its React-PDF template.
// - Uploads to certificates/{PROGRAM_CODE}/{YYYY}/{folio}.pdf.
// - Returns signed URL valid 1 year, persisted on policies.certificate_pdf_url.
// - Audit: action='CERTIFICATE_PDF_GENERATED'.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderPdfToBytes } from "./render";
import { SmokeTestDoc } from "./templates/SmokeTest";
import { CertificateABC } from "./templates/CertificateABC";
import { CertificateFutCare } from "./templates/CertificateFutCare";
import { CertificateMCV } from "./templates/CertificateMCV";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

function dispatchTemplate(programCode: string, data: any) {
  const code = (programCode ?? "").toUpperCase();
  switch (code) {
    case "ABC":
      return (
        <CertificateABC
          folio={data.policy.folio}
          issue_date={data.policy.issue_date}
          client={data.client}
          dependents={data.dependents}
          beneficiaries={data.beneficiaries}
          validity_from={data.policy.start_date}
          validity_to={data.policy.end_date}
          contractor_signature_url={data.client?.contractor_signature_url ?? null}
          insured_signature_url={data.client?.signature_url ?? null}
        />
      );
    case "FUTCARE":
    case "FUT-CARE":
      return (
        <CertificateFutCare
          folio={data.policy.folio}
          issue_date={data.policy.issue_date}
          client={data.client}
          beneficiaries={data.beneficiaries}
          validity_from={data.policy.start_date}
          validity_to={data.policy.end_date}
          contractor_signature_url={data.client?.contractor_signature_url ?? null}
          insured_signature_url={data.client?.signature_url ?? null}
        />
      );
    case "MCV":
    case "MANOSCONVALOR":
      return (
        <CertificateMCV
          folio={data.policy.folio}
          issue_date={data.policy.issue_date}
          client={data.client}
          beneficiaries={data.beneficiaries}
          validity_from={data.policy.start_date}
          validity_to={data.policy.end_date}
          contractor_signature_url={data.client?.contractor_signature_url ?? null}
          insured_signature_url={data.client?.signature_url ?? null}
        />
      );
    default:
      return <SmokeTestDoc label={`${code} — ${data.policy.folio}`} />;
  }
}

export const generateCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ policy_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: polRaw, error } = await supabase
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
    const pol = polRaw as any;

    const program = pol.programs as { name: string; code: string };
    const programCode = (program?.code ?? "").toUpperCase();

    const { data: coverages } = await supabase
      .from("program_coverages")
      .select("*")
      .eq("program_id", pol.program_id);

    // Fallback for ABC certificates: if no structured dependents rows exist
    // but the client stored a free-text list (clients.metadata.dependents_text),
    // surface it as a single synthetic row so the certificate renders correctly.
    const structuredDeps = (pol.dependents ?? []) as Array<{ full_name?: string | null; relationship?: string | null }>;
    const clientMeta = (pol.clients?.metadata ?? {}) as { dependents_text?: string };
    const depsForPdf =
      structuredDeps.length === 0 && clientMeta.dependents_text
        ? [{ full_name: clientMeta.dependents_text, relationship: null }]
        : structuredDeps;

    const payload = {
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
    };

    const bytes = await renderPdfToBytes(dispatchTemplate(programCode, payload));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const year = new Date().getUTCFullYear();
    const path = `${programCode || "GEN"}/${year}/${payload.policy.folio}.pdf`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("certificates")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("certificates")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (sErr) throw sErr;

    const { error: updErr } = await supabase
      .from("policies")
      .update({ certificate_pdf_url: signed.signedUrl })
      .eq("id", payload.policy.id);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("audit_log").insert({
      user_id: userId,
      program_id: payload.policy.program_id,
      entity_type: "policy",
      entity_id: payload.policy.id,
      action: "CERTIFICATE_PDF_GENERATED",
      diff: { path, program_code: programCode, bytes: bytes.byteLength },
    });

    return { url: signed.signedUrl, path, program_code: programCode };
  });
