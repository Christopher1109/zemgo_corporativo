// Client-side PDF certificate generator.
//
// Renders the React-PDF template in the browser (avoids WASM JIT restrictions
// of Cloudflare Workers), then uploads the resulting bytes through a server
// function which writes to Storage and updates the policy record.

import { createElement } from "react";
import { getCertificatePayload, saveCertificatePdf } from "@/lib/certificate.functions";
import { CertificateABC } from "./templates/CertificateABC";
import { CertificateFutCare } from "./templates/CertificateFutCare";
import { CertificateMCV } from "./templates/CertificateMCV";
import { SmokeTestDoc } from "./templates/SmokeTest";

function buildDoc(programCode: string, data: any) {
  const code = (programCode ?? "").toUpperCase();
  const common = {
    folio: data.policy.folio,
    issue_date: data.policy.issue_date,
    client: data.client,
    beneficiaries: data.beneficiaries,
    validity_from: data.policy.start_date,
    validity_to: data.policy.end_date,
    contractor_signature_url: data.client?.contractor_signature_url ?? null,
    insured_signature_url: data.client?.signature_url ?? null,
  };
  switch (code) {
    case "ABC":
      return createElement(CertificateABC, { ...common, dependents: data.dependents });
    case "FUTCARE":
    case "FUT-CARE":
      return createElement(CertificateFutCare, common);
    case "MCV":
    case "MANOSCONVALOR":
      return createElement(CertificateMCV, common);
    default:
      return createElement(SmokeTestDoc, { label: `${code} — ${data.policy.folio}` });
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function generateCertificateClient(
  policyId: string,
): Promise<{ url: string }> {
  const { programCode, payload } = await getCertificatePayload({ data: { policy_id: policyId } });
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(buildDoc(programCode, payload) as any).toBlob();

  // Save locally first (same-origin blob): extensions/antivirus often block
  // downloads coming straight from the storage domain (ERR_BLOCKED_BY_CLIENT).
  downloadBlob(blob, `${payload.policy.folio}.pdf`);

  const pdf_base64 = await blobToBase64(blob);
  const res = await saveCertificatePdf({
    data: {
      policy_id: policyId,
      folio: payload.policy.folio,
      program_code: programCode || "GEN",
      program_id: payload.policy.program_id,
      pdf_base64,
    },
  });
  return { url: res.url };
}

/** Trigger a local download of a blob without touching any external domain. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Render a certificate PDF in the browser and return the raw bytes (used for bulk ZIP downloads). */
export async function renderCertificateBlob(policyId: string): Promise<Blob> {
  const { programCode, payload } = await getCertificatePayload({ data: { policy_id: policyId } });
  const { pdf } = await import("@react-pdf/renderer");
  return await pdf(buildDoc(programCode, payload) as any).toBlob();
}

