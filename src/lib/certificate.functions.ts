// Certificate PDF — split workflow:
//  - getCertificatePayload: fetch all data the React-PDF template needs (server).
//  - saveCertificatePdf:   accept base64 PDF rendered in the browser, upload to
//                          storage, sign URL, persist on policies, audit log.
//
// PDF rendering itself runs in the browser (see src/lib/pdf/generateCertificate.client.ts)
// because @react-pdf/renderer's yoga-layout WASM cannot be JIT-compiled in
// Cloudflare Workers ("Wasm code generation disallowed by embedder").

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export const getCertificatePayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ policy_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: polRaw, error } = await supabase
      .from("policies")
      .select(
        "id, folio, policy_number, certificate_number, issue_date, start_date, end_date, contracting_party, premium, sum_insured, deductible, program_id, " +
          "programs(name, code), " +
          "clients(*), " +
          "beneficiaries(full_name, relationship, percentage), " +
          "dependents(full_name, relationship, date_of_birth)",
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

export const saveCertificatePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Decode base64 → Uint8Array (Worker has global Buffer with nodejs_compat).
    const bytes = Uint8Array.from(Buffer.from(data.pdf_base64, "base64"));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const year = new Date().getUTCFullYear();
    const path = `${data.program_code || "GEN"}/${year}/${data.folio}.pdf`;

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
      .eq("id", data.policy_id);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("audit_log").insert({
      user_id: userId,
      program_id: data.program_id,
      entity_type: "policy",
      entity_id: data.policy_id,
      action: "CERTIFICATE_PDF_GENERATED",
      diff: { path, program_code: data.program_code, bytes: bytes.byteLength },
    });

    return { url: signed.signedUrl, path };
  });
