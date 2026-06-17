import { renderPdfToBytes } from "../src/lib/pdf/render";
import { CertificateABC } from "../src/lib/pdf/templates/CertificateABC";
import { CertificateFutCare } from "../src/lib/pdf/templates/CertificateFutCare";
import { CertificateMCV } from "../src/lib/pdf/templates/CertificateMCV";
import { MedicalPassHIR } from "../src/lib/pdf/templates/MedicalPassHIR";
import { writeFileSync } from "node:fs";

const client = { first_name:"Juan", middle_name:"Carlos", last_name:"Pérez", second_last_name:"Gómez",
  date_of_birth:"1985-07-12", gender:"M", marital_status:"S", curp:"PEGJ850712HNLRZN09",
  address:"Av. Constitución 1234, Col. Centro, Monterrey, N.L. CP 64000",
  phone:"8112345678", email:"juan.perez@example.com" };
const benes = [
  { full_name:"María López Hernández", relationship:"Cónyuge", percentage:60 },
  { full_name:"Sofía Pérez López", relationship:"Hija", percentage:40 },
];
const deps = [
  { full_name:"María López Hernández", relationship:"Cónyuge" },
  { full_name:"Sofía Pérez López", relationship:"Hija" },
];

async function run() {
  const docs: Array<[string, any]> = [
    ["abc",     <CertificateABC folio="ABC-2026-000123" issue_date="2026-06-17" client={client} dependents={deps} beneficiaries={benes} validity_from="2026-06-17" validity_to="2027-06-17" />],
    ["futcare", <CertificateFutCare folio="FUT-2026-000045" issue_date="2026-06-17" client={client} beneficiaries={benes} validity_from="2026-06-17" validity_to="2027-06-17" />],
    ["mcv",     <CertificateMCV folio="MCV-2026-000077" issue_date="2026-06-17" client={client} beneficiaries={benes} validity_from="2026-06-17" validity_to="2027-06-17" />],
    ["hir",     <MedicalPassHIR pass_id="00000000-0000-0000-0000-000000000001" valid_from="2026-06-17T10:30:00Z" valid_until="2026-06-19T10:30:00Z" director_name="Lic. Ricardo Martínez Salinas" director_signature_url={null} snapshot={{ program_code:"HIR", contracting_party:"Colegio San Patricio S.C.", policy_number:"HIR-2026-AP-0099", certificate_number:"CERT-000123", insured_name:"Juan Carlos Pérez Gómez", date_of_birth:"1985-07-12", curp:"PEGJ850712HNLRZN09", sum_insured:150000, deductible:2500, incident_date:"2026-06-17", incident_time:"10:30", incident_description:"El alumno sufrió una caída durante la clase de educación física en la cancha de futbol, presentando dolor en el tobillo derecho con inflamación inmediata.", hospital_name:"Hospital San José - TecSalud" }} />],
  ];
  for (const [name, doc] of docs) {
    try {
      const bytes = await renderPdfToBytes(doc);
      writeFileSync(`/tmp/sample-${name}.pdf`, bytes);
      console.log(name, "OK", bytes.byteLength, "bytes");
    } catch (e: any) {
      console.log(name, "FAIL", e?.message);
    }
  }
}
run();
