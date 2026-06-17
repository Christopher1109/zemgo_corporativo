// Public sample endpoint: render any of the 4 templates with seed data
// and stream the PDF inline. Lets reviewers eyeball the layout without
// requiring real policies/incidents in the DB. No PII, read-only.
// Usage: GET /api/public/pdf-sample?t=abc | futcare | mcv | hir

import { createFileRoute } from "@tanstack/react-router";
import { renderPdfToBytes } from "@/lib/pdf/render";
import { CertificateABC } from "@/lib/pdf/templates/CertificateABC";
import { CertificateFutCare } from "@/lib/pdf/templates/CertificateFutCare";
import { CertificateMCV } from "@/lib/pdf/templates/CertificateMCV";
import { MedicalPassHIR } from "@/lib/pdf/templates/MedicalPassHIR";

const seedClient = {
  first_name: "Juan", middle_name: "Carlos",
  last_name: "Pérez", second_last_name: "Gómez",
  date_of_birth: "1985-07-12", gender: "M", marital_status: "S",
  curp: "PEGJ850712HNLRZN09",
  address: "Av. Constitución 1234, Col. Centro, Monterrey, N.L. CP 64000",
  phone: "8112345678", email: "juan.perez@example.com",
};
const seedBeneficiaries = [
  { full_name: "María López Hernández", relationship: "Cónyuge", percentage: 60 },
  { full_name: "Sofía Pérez López", relationship: "Hija", percentage: 40 },
];
const seedDependents = [
  { full_name: "María López Hernández", relationship: "Cónyuge" },
  { full_name: "Sofía Pérez López", relationship: "Hija" },
];

function buildDoc(t: string) {
  switch (t) {
    case "abc":
      return (
        <CertificateABC
          folio="ABC-2026-000123"
          issue_date="2026-06-17"
          client={seedClient}
          dependents={seedDependents}
          beneficiaries={seedBeneficiaries}
          validity_from="2026-06-17"
          validity_to="2027-06-17"
        />
      );
    case "futcare":
      return (
        <CertificateFutCare
          folio="FUT-2026-000045"
          issue_date="2026-06-17"
          client={seedClient}
          beneficiaries={seedBeneficiaries}
          validity_from="2026-06-17"
          validity_to="2027-06-17"
        />
      );
    case "mcv":
      return (
        <CertificateMCV
          folio="MCV-2026-000077"
          issue_date="2026-06-17"
          client={seedClient}
          beneficiaries={seedBeneficiaries}
          validity_from="2026-06-17"
          validity_to="2027-06-17"
        />
      );
    case "hir":
      return (
        <MedicalPassHIR
          pass_id="00000000-0000-0000-0000-000000000001"
          valid_from="2026-06-17T10:30:00Z"
          valid_until="2026-06-19T10:30:00Z"
          director_name="Lic. Ricardo Martínez Salinas"
          director_signature_url={null}
          snapshot={{
            program_code: "HIR",
            contracting_party: "Colegio San Patricio S.C.",
            policy_number: "HIR-2026-AP-0099",
            certificate_number: "CERT-000123",
            insured_name: "Juan Carlos Pérez Gómez",
            date_of_birth: "1985-07-12",
            curp: "PEGJ850712HNLRZN09",
            sum_insured: 150000,
            deductible: 2500,
            incident_date: "2026-06-17",
            incident_time: "10:30",
            incident_description:
              "El alumno sufrió una caída durante la clase de educación física en la cancha de futbol, presentando dolor en el tobillo derecho con inflamación inmediata.",
            hospital_name: "Hospital San José - TecSalud",
          }}
        />
      );
    default:
      return null;
  }
}

export const Route = createFileRoute("/api/public/pdf-sample")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const t = (url.searchParams.get("t") ?? "").toLowerCase();
        const doc = buildDoc(t);
        if (!doc) {
          return new Response(
            "Use ?t=abc | futcare | mcv | hir",
            { status: 400 },
          );
        }
        try {
          const bytes = await renderPdfToBytes(doc);
          return new Response(bytes as unknown as BodyInit, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `inline; filename="sample-${t}.pdf"`,
              "cache-control": "no-store",
            },
          });
        } catch (e: any) {
          return Response.json(
            { ok: false, t, error: String(e?.message ?? e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
