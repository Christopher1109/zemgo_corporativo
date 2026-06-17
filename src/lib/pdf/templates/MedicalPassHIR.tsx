// MedicalPassHIR — React-PDF translation of carta-aviso-hir.html.
// HIR Seguros: orange (#F37021) + blue (#1976D2) decorative circles,
// 48hr validity highlight, privacy notice, director signature block.
// Page size: Letter. Page padding handled per-section (header has 0 padding
// so the decorative circles can bleed to the edges).

import { Document, Page, Text, View, Image, StyleSheet, Svg, Circle } from "@react-pdf/renderer";
import { PDF_THEME } from "../theme";
import { formatDate, formatCurrency, safe } from "../formatters";

export interface MedicalPassHIRProps {
  pass_id: string;
  valid_from: string;
  valid_until: string;
  director_name: string | null;
  director_signature_url: string | null;
  snapshot: {
    program_code?: string;
    contracting_party?: string | null;
    policy_number?: string | null;
    certificate_number?: string | null;
    insured_name?: string | null;
    date_of_birth?: string | null;
    curp?: string | null;
    sum_insured?: number | string | null;
    deductible?: number | string | null;
    incident_date?: string | null;
    incident_time?: string | null;
    incident_description?: string | null;
    hospital_name?: string | null;
    [k: string]: any;
  };
}

const H = PDF_THEME.hir;

const s = StyleSheet.create({
  page: {
    fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
  },

  // HEADER (no padding so SVG circles can bleed to edges)
  header: { position: "relative", height: 90, marginBottom: 8 },
  headerSvg: { position: "absolute", top: 0, left: 0 },
  headerContent: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    paddingTop: 28, paddingHorizontal: 40,
    flexDirection: "row", alignItems: "center",
  },
  logoBox: {
    width: 62, height: 62, backgroundColor: H.accent, borderRadius: 6,
    alignItems: "center", justifyContent: "center", padding: 4,
  },
  logoIcon: { color: "#FFFFFF", fontSize: 16, fontFamily: "Helvetica-Bold", lineHeight: 1 },
  logoLabel: {
    color: "#FFFFFF", fontSize: 6, marginTop: 3,
    letterSpacing: 1, fontFamily: "Helvetica-Bold",
  },
  titleCell: { flex: 1, paddingLeft: 14, justifyContent: "center" },
  title: {
    fontSize: 22, fontFamily: "Helvetica-Bold", color: H.accent, letterSpacing: 0.5,
  },

  // BODY
  body: { paddingHorizontal: 40, paddingBottom: 6 },
  fieldRow: { flexDirection: "row", marginBottom: 8 },
  field: { flex: 1, paddingRight: 8 },
  fieldLast: { paddingRight: 0 },
  pillLabel: {
    backgroundColor: "#D9EAFA", color: "#0D47A1",
    borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10,
    fontFamily: "Helvetica-Bold", fontSize: 8.5,
    alignSelf: "flex-start", marginBottom: 4,
  },
  pillLabelCenter: { alignSelf: "center" },
  fieldValue: {
    paddingHorizontal: 10, fontSize: 10, color: "#1a1a1a", minHeight: 14,
  },
  fieldValueLarge: {
    paddingHorizontal: 10, paddingVertical: 5, fontSize: 10, color: "#1a1a1a",
    minHeight: 75, borderBottomWidth: 1, borderBottomColor: "#c0c0c0",
    borderStyle: "dashed", lineHeight: 1.5,
  },

  // Declaration
  declaration: {
    marginTop: 18, paddingHorizontal: 40,
    fontSize: 9, lineHeight: 1.45, textAlign: "justify",
  },

  // Signature
  signatureSection: {
    alignItems: "center", marginTop: 28, marginBottom: 14,
    paddingHorizontal: 40,
  },
  signatureArea: {
    height: 56, alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  signatureImg: { maxHeight: 50, maxWidth: 180, objectFit: "contain" },
  signatureName: {
    borderTopWidth: 1, borderTopColor: "#1a1a1a", paddingTop: 4,
    minWidth: 200, textAlign: "center", fontSize: 10,
  },
  signatureCaption: {
    textAlign: "center", fontSize: 9, marginTop: 3, color: "#1a1a1a",
  },

  // Notices
  notice: {
    paddingHorizontal: 40, marginTop: 12, fontSize: 8.5, lineHeight: 1.4,
  },
  noticeTitle: { fontFamily: "Helvetica-Bold" },

  highlight: {
    backgroundColor: H.accent, color: "#FFFFFF",
    textAlign: "center", fontFamily: "Helvetica-Bold",
    fontSize: 11, paddingVertical: 8, paddingHorizontal: 20,
    marginVertical: 12, marginHorizontal: 40, borderRadius: 2,
  },

  privacy: {
    paddingHorizontal: 40, marginTop: 12,
    fontSize: 7, lineHeight: 1.35, textAlign: "justify", color: "#444",
  },
  privacyTitle: { fontFamily: "Helvetica-Bold", color: "#1a1a1a" },

  // Footer
  footer: {
    marginTop: 18, paddingTop: 10, paddingHorizontal: 40, paddingBottom: 30,
    borderTopWidth: 1, borderTopColor: "#e0e0e0",
    flexDirection: "row", fontSize: 8, color: "#555",
  },
  footerItem: { flex: 1 },
  footerCenter: { flex: 1, textAlign: "center" },
  footerRight: { flex: 1, textAlign: "right" },

  // Footer decorative circles (SVG, bottom-left bleed)
  footerSvg: { position: "absolute", bottom: 0, left: 0 },
});

function joinIncidentDateTime(date?: string | null, time?: string | null): string {
  if (!date) return "—";
  return time ? `${formatDate(date)} · ${time}` : formatDate(date);
}

function PillField({
  label, value, center,
}: { label: string; value: string; center?: boolean }) {
  return (
    <View>
      <Text style={[s.pillLabel, center ? s.pillLabelCenter : {}]}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  );
}

export function MedicalPassHIR(props: MedicalPassHIRProps) {
  const snap = props.snapshot ?? {};
  const sum = snap.sum_insured != null && snap.sum_insured !== ""
    ? formatCurrency(snap.sum_insured) : "—";
  const ded = snap.deductible != null && snap.deductible !== ""
    ? formatCurrency(snap.deductible) : "—";

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* HEADER with decorative circles (SVG so they bleed to edges) */}
        <View style={s.header}>
          <Svg width={612} height={90} style={s.headerSvg}>
            {/* big orange */}
            <Circle cx={585} cy={-15} r={100} fill={H.accent} />
            {/* small blue */}
            <Circle cx={470} cy={28} r={28} fill="#1976D2" />
            {/* tiny orange ghost */}
            <Circle cx={400} cy={10} r={21} fill={H.accent} fillOpacity={0.6} />
          </Svg>
          <View style={s.headerContent}>
            <View style={s.logoBox}>
              <Text style={s.logoIcon}>HIR</Text>
              <Text style={s.logoLabel}>SEGUROS</Text>
            </View>
            <View style={s.titleCell}>
              <Text style={s.title}>CARTA AVISO DE ACCIDENTE</Text>
            </View>
          </View>
        </View>

        {/* BODY */}
        <View style={s.body}>
          <View style={s.fieldRow}>
            <View style={[s.field, s.fieldLast]}>
              <Text style={s.pillLabel}>Nombre del Contratante:</Text>
              <Text style={s.fieldValue}>{safe(snap.contracting_party)}</Text>
            </View>
          </View>

          <View style={s.fieldRow}>
            <View style={s.field}>
              <Text style={s.pillLabel}>N° de Póliza:</Text>
              <Text style={s.fieldValue}>{safe(snap.policy_number)}</Text>
            </View>
            <View style={[s.field, s.fieldLast]}>
              <Text style={s.pillLabel}>Nombre del asegurado:</Text>
              <Text style={s.fieldValue}>{safe(snap.insured_name)}</Text>
            </View>
          </View>

          <View style={s.fieldRow}>
            <View style={s.field}>
              <Text style={s.pillLabel}>Fecha de nacimiento:</Text>
              <Text style={s.fieldValue}>{formatDate(snap.date_of_birth)}</Text>
            </View>
            <View style={[s.field, s.fieldLast]}>
              <Text style={s.pillLabel}>CURP:</Text>
              <Text style={s.fieldValue}>{safe(snap.curp)}</Text>
            </View>
          </View>

          <View style={s.fieldRow}>
            <View style={s.field}>
              <Text style={s.pillLabel}>N° de Certificado:</Text>
              <Text style={s.fieldValue}>{safe(snap.certificate_number)}</Text>
            </View>
            <View style={[s.field, s.fieldLast]}>
              <Text style={s.pillLabel}>Suma Asegurada:</Text>
              <Text style={s.fieldValue}>{sum}</Text>
            </View>
          </View>

          <View style={s.fieldRow}>
            <View style={s.field}>
              <Text style={s.pillLabel}>Deducible:</Text>
              <Text style={s.fieldValue}>{ded}</Text>
            </View>
            <View style={s.field}>
              <Text style={s.pillLabel}>Fecha del accidente:</Text>
              <Text style={s.fieldValue}>{formatDate(snap.incident_date)}</Text>
            </View>
            <View style={[s.field, s.fieldLast]}>
              <Text style={s.pillLabel}>Hora:</Text>
              <Text style={s.fieldValue}>{safe(snap.incident_time)}</Text>
            </View>
          </View>

          <View style={s.fieldRow}>
            <View style={[s.field, s.fieldLast]}>
              <Text style={s.pillLabel}>Descripción detallada del accidente (lugar y cómo ocurrió):</Text>
              <Text style={s.fieldValueLarge}>{safe(snap.incident_description)}</Text>
            </View>
          </View>

          <View style={s.fieldRow}>
            <View style={[s.field, s.fieldLast]}>
              <Text style={s.pillLabel}>Hospital al que se dirige:</Text>
              <Text style={s.fieldValue}>{safe(snap.hospital_name)}</Text>
            </View>
          </View>
        </View>

        {/* DECLARATION */}
        <Text style={s.declaration}>
          Hacemos constar que el accidente mencionado ocurrió dentro de la cobertura de
          actividades y/o horarios laborales/escolares; así mismo hacemos constar que la
          persona accidentada se encuentra registrada en nuestra institución, además
          reiteramos que los gastos que excedan la suma asegurada contratada no serán
          cubiertos por HIR Seguros.
        </Text>

        {/* SIGNATURE */}
        <View style={s.signatureSection}>
          <View style={s.signatureArea}>
            {props.director_signature_url ? (
              <Image src={props.director_signature_url} style={s.signatureImg} />
            ) : null}
          </View>
          <Text style={s.signatureName}>{safe(props.director_name)}</Text>
          <Text style={s.signatureCaption}>
            Nombre y firma del Director o Autoridad (correspondiente) (Sello)
          </Text>
        </View>

        {/* IMPORTANT NOTICE */}
        <Text style={s.notice}>
          <Text style={s.noticeTitle}>Importante: </Text>
          La presente no implica la aceptación de la reclamación y/o autorización para
          atención en Pago Directo por parte de HIR Seguros, solo es de carácter informativo.
        </Text>

        {/* 48HR HIGHLIGHT */}
        <Text style={s.highlight}>
          ESTE PASE TIENE UNA VIGENCIA DE ATENCIÓN HASTA 48 HRS DESPUÉS DE OCURRIDO EL ACCIDENTE
        </Text>

        {/* PRIVACY */}
        <Text style={s.privacy}>
          <Text style={s.privacyTitle}>AVISO DE PRIVACIDAD: </Text>
          HIR Compañía de Seguros S.A. de C.V. es responsable del tratamiento de sus
          datos personales, sensibles y patrimoniales, con domicilio en Hermes 28, colonia
          Crédito Constructor, Alcaldía Benito Juárez, C.P. 03940, Ciudad de México y
          utilizará sus datos personales aquí recabados para contacto, evaluación de
          solicitud de seguro, asesoría durante la relación del seguro, dictaminar, tramitar
          solicitudes de siniestros, prevención de operaciones ilícitas, así como la remisión
          de dichos datos a otras instituciones de seguros.
        </Text>
        <Text style={[s.privacy, { marginTop: 4 }]}>
          Para mayor información acerca del tratamiento y de los derechos que puede hacer
          valer, usted puede acceder al Aviso de Privacidad completo a través de la página
          web www.hirseguros.mx, al teléfono 800 7348 447 o a través del correo
          contacto@hirseguros.com.mx
        </Text>

        {/* FOOTER */}
        <View style={s.footer}>
          <Text style={s.footerItem}>✉ www.hirseguros.mx</Text>
          <Text style={s.footerCenter}>☎ 5262 1780 | 800 7348 447</Text>
          <Text style={s.footerRight}>
            ⌖ Hermes 28, Col. Crédito Constructor,{"\n"}Alc. Benito Juárez, CDMX, C.P. 3940
          </Text>
        </View>

        {/* Footer decorative circles (bottom-left bleed) */}
        <Svg width={120} height={120} style={s.footerSvg}>
          <Circle cx={5} cy={115} r={45} fill={H.accent} fillOpacity={0.9} />
          <Circle cx={50} cy={75} r={18} fill="#1976D2" fillOpacity={0.8} />
        </Svg>
      </Page>
    </Document>
  );
}

void joinIncidentDateTime;
void PillField;
