import { renderPdfToBytes } from "../src/lib/pdf/render";
import { MedicalPassHIR } from "../src/lib/pdf/templates/MedicalPassHIR";
const snap = {"folio":"FUTCARE-2026-00093","hospital":"Hospital MAC Cumbres","deductible":null,"insured_dob":"2018-05-11","sum_insured":150000,"insured_curp":"OOGG180511HNLCRBA9","insured_name":"GARZA GABRIEL DE OCHOA","program_code":"FUTCARE","accident_date":"2026-08-25","accident_time":"09:28:00","policy_number":"33454","accident_location":"Mi casa ","contracting_party":"HOPE SERVICIOS ADMINISTRATIVOS Y COMERCIALIZACION SA DE CV","certificate_number":"211","accident_description":"iba caminando y me cai "};
const bytes = await renderPdfToBytes(<MedicalPassHIR pass_id="x" valid_from="2026-08-25" valid_until="2026-08-27" director_name="Superadministrador" director_signature_url={null} snapshot={snap as any} />);
await Bun.write("/tmp/letterqa/out.pdf", bytes);
console.log("ok", bytes.length);
