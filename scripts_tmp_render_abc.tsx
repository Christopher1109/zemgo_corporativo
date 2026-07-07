import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CertificateABC } from "@/lib/pdf/templates/CertificateABC";
import fs from "node:fs";

const doc = React.createElement(CertificateABC, {
  folio: "ABC-2026-000123",
  issue_date: "2026-07-07",
  client: {
    first_name: "Juan Manuel",
    middle_name: "",
    last_name: "Pérez",
    second_last_name: "González",
    date_of_birth: "1985-04-12",
    gender: "M",
    marital_status: "married",
    curp: "PEGJ850412HDFRLN09",
    address: "Av. Insurgentes Sur 123, Col. Roma Norte, CDMX, CP 06700",
    phone: "555 123 4567",
    email: "juan.perez@example.com",
  },
  dependents: [
    { full_name: "María González", relationship: "Cónyuge" },
    { full_name: "Lucía Pérez González", relationship: "Hija" },
  ],
  beneficiaries: [
    { full_name: "María González", relationship: "Cónyuge", percentage: 60 },
    { full_name: "Lucía Pérez González", relationship: "Hija", percentage: 40 },
  ],
  validity_from: "2026-07-07",
  validity_to: "2027-07-07",
  contractor_signature_url: null,
  insured_signature_url: null,
});

const buf = await renderToBuffer(doc as any);
fs.writeFileSync("/tmp/certqa/out_abc.pdf", buf);
console.log("ok", buf.length);
