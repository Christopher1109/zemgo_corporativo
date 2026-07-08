import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { MedicalPassHIR } from "/dev-server/src/lib/pdf/templates/MedicalPassHIR.tsx";
import fs from "fs";
const doc = React.createElement(MedicalPassHIR, {
  snapshot: {
    contracting_party: "Juan Pérez López",
    policy_number: "HIR-2026-001234",
    insured_name: "Juan Pérez López",
    date_of_birth: "1985-03-14",
    curp: "PELJ850314HDFRPN02",
    certificate_number: "ZMG-ABC-000042",
    sum_insured: 250000,
    deductible: 3500,
    incident_date: "2026-07-05",
    incident_time: "14:30",
    incident_description: "El asegurado sufrió una caída en las escaleras del centro de trabajo, presentando lesión en tobillo derecho con inflamación y dolor moderado. Se solicita valoración médica.",
    hospital_name: "Hospital Ángeles del Pedregal",
  },
});
const b = await renderToBuffer(doc);
fs.writeFileSync("/tmp/pass.pdf", b);
console.log("ok", b.length);
