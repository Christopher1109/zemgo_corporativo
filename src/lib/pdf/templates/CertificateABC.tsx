// CertificateABC — Reproducción fiel del certificado modelo (Excel).
// Página Letter (612 x 792 pt). Márgenes L/R ≈ 54 pt, T/B ≈ 34 pt.
// Todas las medidas están calculadas para replicar la maqueta del PDF original.

import { Document, Page, Text, View, Image, StyleSheet, Link } from "@react-pdf/renderer";
import { PDF_THEME, HOPE_FOOTER } from "../theme";
import programAbcLogo from "@/assets/program-abc.png.asset.json";
import {
  formatDate, formatCurrency, formatGender, formatMaritalStatus,
  calcAge, safe,
} from "../formatters";

export interface CertificateABCProps {
  folio: string;
  issue_date: string | null;
  client: {
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    second_last_name?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    marital_status?: string | null;
    curp?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  dependents: Array<{ full_name?: string | null; relationship?: string | null }>;
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

const ABC = PDF_THEME.programs.ABC;
const C = PDF_THEME.common;

// Anchos de columna del header (suman ≈ 504pt del área de contenido).
const COL_LOGO = 114;
const COL_TITLE = 198;
const COL_RIGHT = 192;

const BORDER = "#B8B8B8";

const s = StyleSheet.create({
  page: {
    paddingTop: 30, paddingBottom: 14, paddingHorizontal: 54,
    fontSize: 8, color: C.text, fontFamily: "Helvetica",
    backgroundColor: C.pageBg, lineHeight: 1.15,
  },

  // ============ HEADER ============
  header: { flexDirection: "row" },
  hLogo: {
    width: COL_LOGO, borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center", padding: 6,
  },
  logoImage: { width: 68, height: 68, objectFit: "contain" },
  hTitle: {
    width: COL_TITLE, borderTopWidth: 1, borderBottomWidth: 1, borderRightWidth: 1,
    borderColor: BORDER, alignItems: "center", justifyContent: "center", padding: 6,
    fontSize: 11, fontFamily: "Helvetica-Bold",
  },
  hRight: { width: COL_RIGHT, flexDirection: "column" },
  hAddress: {
    borderTopWidth: 1, borderRightWidth: 1, borderColor: BORDER,
    padding: 5, fontSize: 7.5, lineHeight: 1.2, flexGrow: 1,
  },
  hFolioLbl: {
    borderTopWidth: 1, borderRightWidth: 1, borderColor: BORDER,
    backgroundColor: C.rowHeader, textAlign: "center",
    fontFamily: "Helvetica-Bold", padding: 3, fontSize: 9,
  },
  hFolioVal: {
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: BORDER, textAlign: "center", padding: 3,
  },

  // ============ RAMO / FECHA (indentado) ============
  ramoRow: { flexDirection: "row", marginTop: 6 },
  ramoSpacer: { width: COL_LOGO },
  ramoCell: { width: COL_TITLE, flexDirection: "column" },
  ramoFecha: { width: COL_RIGHT, flexDirection: "column" },
  ramoLbl: {
    borderWidth: 1, borderColor: BORDER,
    padding: 3, textAlign: "center", fontFamily: "Helvetica-Bold",
  },
  ramoVal: {
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: BORDER, padding: 3, textAlign: "center",
  },
  ramoLblRight: {
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: BORDER, padding: 3, textAlign: "center",
    fontFamily: "Helvetica-Bold",
  },
  ramoValRight: {
    borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: BORDER, padding: 3, textAlign: "center",
  },

  // ============ SECCIÓN VERDE ============
  section: {
    backgroundColor: ABC.primary, color: "#FFFFFF",
    fontFamily: "Helvetica-Bold", textAlign: "center",
    padding: 3, marginTop: 4, fontSize: 9,
    borderWidth: 1, borderColor: ABC.primary,
  },

  // ============ TABLA DE DATOS (celdas horizontales) ============
  tbl: { borderLeftWidth: 1, borderRightWidth: 0, borderColor: BORDER },
  row: { flexDirection: "row" },
  lblCell: {
    flex: 1, padding: 3, fontFamily: "Helvetica-Bold",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
  },
  valCell: {
    flex: 1, padding: 3,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
  },

  // ============ COBERTURAS ============
  covHdr: {
    flex: 1, padding: 3, fontFamily: "Helvetica-Bold", textAlign: "center",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
  },
  covCell: {
    flex: 1, padding: 3, textAlign: "center",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
  },
  covItalic: {
    flex: 1, padding: 3, textAlign: "center", color: "#666",
    fontStyle: "italic",
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
  },

  // ============ ADVERTENCIA ============
  warning: {
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: BORDER, padding: 4, fontSize: 6.8, lineHeight: 1.2,
  },
  warnTitle: { fontFamily: "Helvetica-Bold" },


  // ============ VIGENCIA + FIRMAS ============
  vigRow: { flexDirection: "row", marginTop: 4, marginBottom: 2 },
  vigCell: { flex: 1, textAlign: "center", padding: 3 },
  vigLine: { textDecoration: "underline" },

  sigRow: {
    flexDirection: "row", borderTopWidth: 1, borderLeftWidth: 1,
    borderRightWidth: 1, borderColor: BORDER,
  },
  sigLbl: {
    flex: 1, backgroundColor: C.rowHeader,
    fontFamily: "Helvetica-Bold", textAlign: "center", padding: 3,
    borderRightWidth: 1, borderColor: BORDER,
  },
  sigLblLast: { flex: 1, backgroundColor: C.rowHeader,
    fontFamily: "Helvetica-Bold", textAlign: "center", padding: 3 },
  sigBoxRow: {
    flexDirection: "row",
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: BORDER,
  },
  sigBox: {
    flex: 1, height: 40, alignItems: "center", justifyContent: "center",
    borderRightWidth: 1, borderColor: BORDER,
  },
  sigBoxLast: { flex: 1, height: 40, alignItems: "center", justifyContent: "center" },
  sigImg: { maxHeight: 70, maxWidth: "80%", objectFit: "contain" },

  // ============ FOOTER ============
  footer: {
    backgroundColor: ABC.primary, marginTop: 4,
    flexDirection: "row", padding: 6, alignItems: "center",
  },
  fLeft: { flex: 2 },
  fMain: { color: "#FFFFFF", fontSize: 8 },
  fSmall: { color: "#FFFFFF", fontSize: 7, fontStyle: "italic", textAlign: "center" },
  fRight: { flex: 1, color: "#FFFFFF", fontSize: 8, textAlign: "right" },
});

function joinName(c: CertificateABCProps["client"]) {
  const nombres = [c.first_name, c.middle_name].filter(Boolean).join(" ").trim();
  const apellidos = [c.last_name, c.second_last_name].filter(Boolean).join(" ").trim();
  return { nombres: nombres || "—", apellidos: apellidos || "—" };
}

function dependentsLine(deps: CertificateABCProps["dependents"]): string {
  if (!deps || deps.length === 0) return "—";
  return deps
    .map((d) => {
      const rel = d.relationship ? ` (${d.relationship})` : "";
      return `${d.full_name ?? ""}${rel}`.trim();
    })
    .filter(Boolean)
    .join(", ") || "—";
}

const COVERAGES_ABC: Array<{ label: string; amount: string; italic?: boolean }> = [
  { label: "Por fallecimiento", amount: "$100,000" },
  { label: "En Muerte accidental, personas mayores de 18 años, apoyo de:", amount: "$50,000", italic: true },
  { label: "Atención Médica por accidente", amount: "$25,000" },
  { label: "Servicios funerarios", amount: "$25,000" },
];

export function CertificateABC(props: CertificateABCProps) {
  const { nombres, apellidos } = joinName(props.client);
  const b1 = props.beneficiaries[0];
  const b2 = props.beneficiaries[1];

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* ===== HEADER ===== */}
        <View style={s.header}>
          <View style={s.hLogo}>
            <Image src={programAbcLogo.url} style={s.logoImage} />
          </View>
          <View style={s.hTitle}>
            <Text>CERTIFICADO DE COBERTURA</Text>
          </View>
          <View style={s.hRight}>
            <View style={s.hAddress}>
              <Text>Blvd. Rogelio Cantú Gomez #1000 L-82</Text>
              <Text>Hacienda San Jerónimo</Text>
              <Text>Monterrey, N.L. CP. 64637</Text>
              <Text>Tel: (81)14-92-22-00</Text>
            </View>
            <Text style={s.hFolioLbl}>FOLIO:</Text>
            <Text style={s.hFolioVal}>{safe(props.folio)}</Text>
          </View>
        </View>

        {/* ===== RAMO / FECHA (indentado bajo el logo) ===== */}
        <View style={s.ramoRow}>
          <View style={s.ramoSpacer} />
          <View style={s.ramoCell}>
            <Text style={s.ramoLbl}>Ramo del seguro.</Text>
            <Text style={s.ramoVal}>AP, Vida y funerarios.</Text>
          </View>
          <View style={s.ramoFecha}>
            <Text style={s.ramoLblRight}>Fecha de Emisión del Certificado</Text>
            <Text style={s.ramoValRight}>{formatDate(props.issue_date)}</Text>
          </View>
        </View>

        {/* ===== ASEGURADO TITULAR ===== */}
        <Text style={s.section}>ASEGURADO TITULAR</Text>
        <View style={s.tbl}>
          <View style={s.row}>
            <Text style={s.lblCell}>Nombres:</Text>
            <Text style={s.lblCell}>Apellidos:</Text>
            <Text style={s.lblCell}>Fecha de Nacimiento:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valCell}>{nombres}</Text>
            <Text style={s.valCell}>{apellidos}</Text>
            <Text style={s.valCell}>{formatDate(props.client.date_of_birth)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.lblCell}>Edad:</Text>
            <Text style={[s.lblCell, { flex: 2 }]}>Género:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valCell}>{calcAge(props.client.date_of_birth)}</Text>
            <Text style={[s.valCell, { flex: 2 }]}>{formatGender(props.client.gender)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.lblCell}>Estado Civil:</Text>
            <Text style={[s.lblCell, { flex: 2 }]}>Curp:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valCell}>{formatMaritalStatus(props.client.marital_status)}</Text>
            <Text style={[s.valCell, { flex: 2 }]}>{safe(props.client.curp)}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.lblCell, { flex: 3 }]}>Nombre de los dependientes (cónyuge e hijos)</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.valCell, { flex: 3, minHeight: 32 }]}>{dependentsLine(props.dependents)}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.lblCell, { flex: 3 }]}>Dirección:</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.valCell, { flex: 3 }]}>{safe(props.client.address)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.lblCell}>Celular:</Text>
            <Text style={[s.lblCell, { flex: 2 }]}>Correo:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valCell}>{safe(props.client.phone)}</Text>
            <Text style={[s.valCell, { flex: 2 }]}>{safe(props.client.email)}</Text>
          </View>
        </View>

        {/* ===== COBERTURAS ===== */}
        <Text style={s.section}>TABLA DE COBERTURA(s) CONTRATADA(s)</Text>
        <View style={s.tbl}>
          <View style={s.row}>
            <Text style={s.covHdr}>Coberturas:</Text>
            <Text style={s.covHdr}>Suma Asegurada:</Text>
          </View>
          {COVERAGES_ABC.map((c, i) => (
            <View style={s.row} key={i}>
              <Text style={c.italic ? s.covItalic : s.covCell}>{c.label}</Text>
              <Text style={c.italic ? s.covItalic : s.covCell}>{c.amount}</Text>
            </View>
          ))}
        </View>

        {/* ===== BENEFICIARIOS ===== */}
        <Text style={s.section}>BENEFICIARIOS</Text>
        <View style={s.tbl}>
          <View style={s.row}>
            <Text style={s.lblCell}>Nombre:</Text>
            <Text style={s.lblCell}>Parentesco:</Text>
            <Text style={s.lblCell}>Porcentaje:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valCell}>{safe(b1?.full_name, "")}</Text>
            <Text style={s.valCell}>{safe(b1?.relationship, "")}</Text>
            <Text style={s.valCell}>
              {b1?.percentage !== undefined && b1?.percentage !== null && b1?.percentage !== ""
                ? `${b1.percentage}%` : ""}
            </Text>
          </View>
          <View style={s.row}>
            <Text style={s.lblCell}>Nombre:</Text>
            <Text style={s.lblCell}>Parentesco:</Text>
            <Text style={s.lblCell}>Porcentaje:</Text>
          </View>
          <View style={s.row}>
            <Text style={s.valCell}>{safe(b2?.full_name, "")}</Text>
            <Text style={s.valCell}>{safe(b2?.relationship, "")}</Text>
            <Text style={s.valCell}>
              {b2?.percentage !== undefined && b2?.percentage !== null && b2?.percentage !== ""
                ? `${b2.percentage}%` : ""}
            </Text>
          </View>
        </View>

        {/* ===== FIRMAS / ADVERTENCIA ===== */}
        <Text style={s.section}>FIRMAS</Text>
        <View style={s.warning}>
          <Text style={s.warnTitle}>Advertencia:</Text>
          <Text>
            En el caso de que se desee nombrar beneficiarios a menores de edad, no se debe señalar a un mayor de edad como representante de los menores para efecto de que, en su representación, cobre la indemnización.
          </Text>
          <Text>
            Lo anterior porque las legislaciones civiles previenen la forma en que debe designarse tutores, albaceas, representantes de herederos u otros cargos similares y no consideran al contrato de seguro como el instrumento adecuado para tales designaciones.
          </Text>
          <Text>
            La designación que se hiciera de un mayor de edad como representante de menores beneficiarios, durante la minoría de edad de ellos, legalmente puede implicar que se nombra beneficiario al mayor de edad, quien en todo caso sólo tendría una obligación moral, pues la designación que se hace de beneficiarios en un contrato de seguro le concede el derecho incondicionado de disponer de la suma asegurada.
          </Text>
        </View>

        {/* ===== VIGENCIA ===== */}
        <View style={s.vigRow}>
          <View style={s.vigCell}>
            <Text>
              Vigencia del: <Text style={s.vigLine}>{"  " + formatDate(props.validity_from) + "  "}</Text>
            </Text>
          </View>
          <View style={s.vigCell}>
            <Text>
              al: <Text style={s.vigLine}>{"  " + formatDate(props.validity_to) + "  "}</Text>
            </Text>
          </View>
        </View>

        {/* ===== CAJA DE FIRMAS ===== */}
        <View style={s.sigRow}>
          <Text style={s.sigLbl}>Firma del Contratante:</Text>
          <Text style={s.sigLblLast}>Firma del Asegurado Titular:</Text>
        </View>
        <View style={s.sigBoxRow}>
          <View style={s.sigBox}>
            {props.contractor_signature_url ? (
              <Image src={props.contractor_signature_url} style={s.sigImg} />
            ) : null}
          </View>
          <View style={s.sigBoxLast}>
            {props.insured_signature_url ? (
              <Image src={props.insured_signature_url} style={s.sigImg} />
            ) : null}
          </View>
        </View>

        {/* ===== FOOTER ===== */}
        <View style={s.footer}>
          <View style={s.fLeft}>
            <Text style={s.fMain}>{HOPE_FOOTER}</Text>
            <Text style={s.fSmall}>*Documento informativo sin validez oficial.</Text>
          </View>
          <Link src="https://www.zemgoseguros.com.mx/" style={s.fRight}>
            https://www.zemgoseguros.com.mx/
          </Link>
        </View>
      </Page>
    </Document>
  );
}

void formatCurrency;
