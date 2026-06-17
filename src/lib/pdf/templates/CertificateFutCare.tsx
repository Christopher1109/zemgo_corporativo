// CertificateFutCare — React-PDF translation of certificate-futcare.html.
// Color scheme: blue (#1565C0). Ramo: AP Deportivo.
// Page size: Letter, margins ≈ 12mm x 14mm (34 x 40 pt).

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { PDF_THEME, HOPE_FOOTER } from "../theme";
import { formatDate, formatGender, safe } from "../formatters";

export interface CertificateFutCareProps {
  folio: string;
  issue_date: string | null;
  client: {
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    second_last_name?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    curp?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  beneficiaries: Array<{
    full_name?: string | null;
    relationship?: string | null;
    percentage?: number | string | null;
  }>;
  validity_from: string | null;
  validity_to: string | null;
  contractor_signature_url?: string | null;
  insured_signature_url?: string | null;
}

const F = PDF_THEME.programs.FUTCARE;
const C = PDF_THEME.common;

const s = StyleSheet.create({
  page: {
    paddingTop: 34, paddingBottom: 34, paddingHorizontal: 40,
    fontSize: 9, color: C.text, fontFamily: "Helvetica", backgroundColor: C.pageBg,
  },

  // Header
  header: { flexDirection: "row", borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  hLogo: {
    width: 130, padding: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: F.primary, borderRightWidth: 1, borderColor: C.border,
  },
  brandMain: {
    color: F.textOnPrimary, fontSize: 15, fontFamily: "Helvetica-Bold",
    letterSpacing: 1, textAlign: "center",
  },
  brandTagline: {
    marginTop: 5, fontSize: 6.5, letterSpacing: 1.2,
    backgroundColor: "#FFFFFF", color: F.primary, paddingVertical: 2, paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold", textAlign: "center",
  },
  hTitle: {
    flex: 1, padding: 8, fontSize: 12, fontFamily: "Helvetica-Bold",
    textAlign: "center", borderRightWidth: 1, borderColor: C.border,
    justifyContent: "center",
  },
  hTitleText: { textAlign: "center" },
  hAddress: { width: 170, padding: 8, fontSize: 7, lineHeight: 1.3 },

  // Folio row
  folioRow: { flexDirection: "row", marginBottom: 10 },
  folioSpacer: { flex: 1 },
  folioTag: {
    backgroundColor: F.primary, color: F.textOnPrimary,
    paddingVertical: 6, paddingHorizontal: 10,
    fontFamily: "Helvetica-Bold", textAlign: "center", fontSize: 10,
  },

  // Tables
  table: { borderWidth: 1, borderColor: C.border, borderBottomWidth: 0 },
  tableLast: { borderBottomWidth: 1 },
  row: { flexDirection: "row" },
  th: {
    flex: 1, backgroundColor: C.rowHeader, padding: 5, textAlign: "center",
    fontFamily: "Helvetica-Bold", borderRightWidth: 1, borderColor: C.border,
    borderBottomWidth: 1,
  },
  thLast: { borderRightWidth: 0 },
  td: {
    flex: 1, padding: 5, textAlign: "center",
    borderRightWidth: 1, borderColor: C.border, borderBottomWidth: 1,
  },
  tdLast: { borderRightWidth: 0 },

  // Section header (blue)
  section: {
    backgroundColor: F.sectionBg, borderWidth: 1, borderColor: F.primary,
    paddingVertical: 5, textAlign: "center",
    fontFamily: "Helvetica-Bold", color: F.sectionText,
    letterSpacing: 0.5, marginTop: 8,
  },

  // Data rows
  labelCell: {
    flex: 1, padding: 5, backgroundColor: C.rowAlt,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border,
  },
  valueCell: {
    flex: 1, padding: 5,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border,
  },
  cellLast: { borderRightWidth: 0 },

  // Coverage amount
  amount: { textAlign: "right", fontFamily: "Helvetica-Bold" },
  coverageNote: { fontSize: 7.5, color: C.muted, fontStyle: "italic", marginTop: 1 },

  // Warning
  warning: {
    borderWidth: 1, borderTopWidth: 0, borderColor: C.border,
    padding: 8, fontSize: 7.5, lineHeight: 1.35, textAlign: "justify",
  },
  warningTitle: { fontFamily: "Helvetica-Bold", marginBottom: 3 },

  // Validity & signatures
  validityRow: { flexDirection: "row", marginTop: 10, marginBottom: 4 },
  validityCell: { flex: 1, padding: 6 },
  validityUnderline: { borderBottomWidth: 1, borderColor: C.text, paddingBottom: 2 },

  signaturesRow: { flexDirection: "row", borderWidth: 1, borderColor: C.border },
  signatureCell: {
    flex: 1, padding: 8, alignItems: "center",
    borderRightWidth: 1, borderColor: C.border,
  },
  sigLabel: {
    fontFamily: "Helvetica-Bold", backgroundColor: C.rowAlt,
    padding: 4, marginBottom: 6, width: "100%", textAlign: "center",
    borderBottomWidth: 1, borderColor: C.softBorder,
  },
  sigArea: { height: 56, width: "100%", alignItems: "center", justifyContent: "center" },
  sigImage: { maxHeight: 50, objectFit: "contain" },

  // Footer
  footer: {
    backgroundColor: F.primary, color: F.textOnPrimary, padding: 8,
    marginTop: 14, flexDirection: "row",
  },
  footerLeft: { flex: 2 },
  footerMain: { fontFamily: "Helvetica-Bold", fontSize: 8, color: F.textOnPrimary },
  footerSmall: { fontSize: 7, marginTop: 2, fontStyle: "italic", color: F.textOnPrimary },
  footerRight: { flex: 1, fontSize: 7.5, textAlign: "right", color: F.textOnPrimary },
});

function joinName(c: CertificateFutCareProps["client"]) {
  const nombres = [c.first_name, c.middle_name].filter(Boolean).join(" ").trim();
  const apellidos = [c.last_name, c.second_last_name].filter(Boolean).join(" ").trim();
  return { nombres: nombres || "—", apellidos: apellidos || "—" };
}

const COVERAGES_FUTCARE: Array<{ label: string; note?: string; amount: string }> = [
  { label: "Accidentes deportivos en competencia, entrenamiento y traslados sin escala.", amount: "$75,000" },
  {
    label: "Muerte accidental a causa de un accidente durante el partido o entrenamiento*",
    note: "(en menores de 12 años aplica cobertura de gastos funerarios)",
    amount: "$150,000",
  },
  { label: "Pérdidas Orgánicas", amount: "$150,000" },
];

export function CertificateFutCare(props: CertificateFutCareProps) {
  const { nombres, apellidos } = joinName(props.client);
  const b1 = props.beneficiaries[0];
  const b2 = props.beneficiaries[1];

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* HEADER */}
        <View style={s.header}>
          <View style={s.hLogo}>
            <Text style={s.brandMain}>FUT-CARE</Text>
            <Text style={s.brandTagline}>TU SEGURO FUTBOLERO</Text>
          </View>
          <View style={s.hTitle}><Text style={s.hTitleText}>CERTIFICADO DE COBERTURA</Text></View>
          <View style={s.hAddress}>
            <Text>Blvd. Rogelio Cantú Gomez #1000 L-82</Text>
            <Text>Hacienda San Jerónimo</Text>
            <Text>Monterrey, N.L. CP. 64637</Text>
            <Text>Tel: (81)14-92-22-00</Text>
          </View>
        </View>

        {/* FOLIO */}
        <View style={s.folioRow}>
          <View style={s.folioSpacer} />
          <View style={[s.folioTag, { width: 180 }]}>
            <Text>FOLIO: {safe(props.folio)}</Text>
          </View>
        </View>

        {/* BRANCH TABLE */}
        <View style={[s.table, s.tableLast]}>
          <View style={s.row}>
            <Text style={s.th}>Ramo del seguro.</Text>
            <Text style={[s.th, s.thLast]}>Fecha de Emisión del Certificado</Text>
          </View>
          <View style={s.row}>
            <Text style={s.td}>AP Deportivo</Text>
            <Text style={[s.td, s.tdLast]}>{formatDate(props.issue_date)}</Text>
          </View>
        </View>

        {/* ASEGURADO TITULAR */}
        <Text style={s.section}>ASEGURADO TITULAR</Text>
        <View style={[s.table, s.tableLast]}>
          <View style={s.row}>
            <Text style={s.labelCell}>Nombres:</Text>
            <Text style={s.labelCell}>Apellidos:</Text>
            <Text style={[s.labelCell, s.cellLast]}>Fecha de Nacimiento:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valueCell}>{nombres}</Text>
            <Text style={s.valueCell}>{apellidos}</Text>
            <Text style={[s.valueCell, s.cellLast]}>{formatDate(props.client.date_of_birth)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.labelCell}>Género:</Text>
            <Text style={[s.labelCell, s.cellLast, { flex: 2 }]}>CURP:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valueCell}>{formatGender(props.client.gender)}</Text>
            <Text style={[s.valueCell, s.cellLast, { flex: 2 }]}>{safe(props.client.curp)}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.labelCell, s.cellLast, { flex: 3 }]}>Dirección:</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.valueCell, s.cellLast, { flex: 3 }]}>{safe(props.client.address)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.labelCell}>Celular:</Text>
            <Text style={[s.labelCell, s.cellLast, { flex: 2 }]}>Correo:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valueCell}>{safe(props.client.phone)}</Text>
            <Text style={[s.valueCell, s.cellLast, { flex: 2 }]}>{safe(props.client.email)}</Text>
          </View>
        </View>

        {/* COBERTURAS */}
        <Text style={s.section}>TABLA DE COBERTURA(s) CONTRATADA(s)</Text>
        <View style={[s.table, s.tableLast]}>
          <View style={s.row}>
            <Text style={[s.th, { flex: 3 }]}>Coberturas:</Text>
            <Text style={[s.th, s.thLast]}>Suma Asegurada:</Text>
          </View>
          {COVERAGES_FUTCARE.map((c, i) => (
            <View style={s.row} key={i}>
              <View style={[s.valueCell, { flex: 3 }]}>
                <Text>{c.label}</Text>
                {c.note ? <Text style={s.coverageNote}>{c.note}</Text> : null}
              </View>
              <Text style={[s.valueCell, s.cellLast, s.amount]}>{c.amount}</Text>
            </View>
          ))}
        </View>

        {/* BENEFICIARIOS */}
        <Text style={s.section}>BENEFICIARIOS</Text>
        <View style={[s.table, s.tableLast]}>
          <View style={s.row}>
            <Text style={s.th}>Nombre:</Text>
            <Text style={s.th}>Parentesco:</Text>
            <Text style={[s.th, s.thLast]}>Porcentaje:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valueCell}>{safe(b1?.full_name, "")}</Text>
            <Text style={s.valueCell}>{safe(b1?.relationship, "")}</Text>
            <Text style={[s.valueCell, s.cellLast]}>
              {b1?.percentage !== undefined && b1?.percentage !== null && b1?.percentage !== ""
                ? `${b1.percentage}%` : ""}
            </Text>
          </View>
          <View style={s.row}>
            <Text style={s.th}>Nombre:</Text>
            <Text style={s.th}>Parentesco:</Text>
            <Text style={[s.th, s.thLast]}>Porcentaje:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valueCell}>{safe(b2?.full_name, "")}</Text>
            <Text style={s.valueCell}>{safe(b2?.relationship, "")}</Text>
            <Text style={[s.valueCell, s.cellLast]}>
              {b2?.percentage !== undefined && b2?.percentage !== null && b2?.percentage !== ""
                ? `${b2.percentage}%` : ""}
            </Text>
          </View>
        </View>

        {/* FIRMAS / ADVERTENCIA */}
        <Text style={s.section}>FIRMAS</Text>
        <View style={s.warning}>
          <Text style={s.warningTitle}>Advertencia:</Text>
          <Text>
            En el caso de que se desee nombrar beneficiarios a menores de edad, no se debe señalar
            a un mayor de edad como representante de los menores para efecto de que, en su
            representación, cobre la indemnización.
          </Text>
          <Text>{"\n"}Lo anterior porque las legislaciones civiles previenen la forma en que debe
            designarse tutores, albaceas, representantes de herederos u otros cargos similares y
            no consideran al contrato de seguro como el instrumento adecuado para tales
            designaciones.
          </Text>
          <Text>{"\n"}La designación que se hiciera de un mayor de edad como representante de menores
            beneficiarios, durante la minoría de edad de ellos, legalmente puede implicar que se
            nombra beneficiario al mayor de edad, quien en todo caso sólo tendría una obligación
            moral, pues la designación que se hace de beneficiarios en un contrato de seguro le
            concede el derecho incondicionado de disponer de la suma asegurada.
          </Text>
        </View>

        {/* VIGENCIA */}
        <View style={s.validityRow}>
          <View style={s.validityCell}>
            <Text>
              Vigencia del: <Text style={s.validityUnderline}>{"  " + formatDate(props.validity_from) + "  "}</Text>
            </Text>
          </View>
          <View style={s.validityCell}>
            <Text>
              Al: <Text style={s.validityUnderline}>{"  " + formatDate(props.validity_to) + "  "}</Text>
            </Text>
          </View>
        </View>

        {/* FIRMAS BOX */}
        <View style={s.signaturesRow}>
          <View style={s.signatureCell}>
            <Text style={s.sigLabel}>Firma del Contratante:</Text>
            <View style={s.sigArea}>
              {props.contractor_signature_url ? (
                <Image src={props.contractor_signature_url} style={s.sigImage} />
              ) : null}
            </View>
          </View>
          <View style={[s.signatureCell, { borderRightWidth: 0 }]}>
            <Text style={s.sigLabel}>Firma del Asegurado Titular:</Text>
            <View style={s.sigArea}>
              {props.insured_signature_url ? (
                <Image src={props.insured_signature_url} style={s.sigImage} />
              ) : null}
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <View style={s.footer}>
          <View style={s.footerLeft}>
            <Text style={s.footerMain}>{HOPE_FOOTER}</Text>
            <Text style={s.footerSmall}>*Documento informativo sin validez oficial.</Text>
          </View>
          <Text style={s.footerRight}>https://www.zemgoseguros.com.mx/</Text>
        </View>
      </Page>
    </Document>
  );
}
