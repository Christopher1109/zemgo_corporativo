// MedicalPassHIR — Carta Aviso de Accidente (HIR Seguros)
// Diseño replicado del PDF oficial: fondo blanco, círculos decorativos
// (naranja + azul), campos con "píldoras" de fondo gris muy claro y
// franja azul marino en el pie con datos de contacto.

import { Document, Page, Text, View, Image, StyleSheet, Svg, Circle } from "@react-pdf/renderer";
import { PDF_THEME } from "../theme";
import { formatDate, formatCurrency, safe } from "../formatters";

export interface MedicalPassHIRProps {
  pass_id?: string;
  valid_from?: string;
  valid_until?: string;
  director_name?: string | null;
  director_signature_url?: string | null;
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
    [k: string]: unknown;
  };
}

const H = PDF_THEME.hir;
const ORANGE = H.accent;                  // #F58220
const NAVY = "#0B2E63";                   // franja de pie
const PILL_BG = "#EEF2F5";                // fondo de campos
const PILL_LABEL = "#0B2E63";
const TEAL = "#1CA398";                    // círculo decorativo derecho medio

const s = StyleSheet.create({
  page: {
    fontSize: 9.5, color: "#1a1a1a", fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF", paddingBottom: 40,
  },

  // ---- HEADER ----
  headerWrap: { position: "relative", height: 90 },
  headerSvg: { position: "absolute", top: 0, left: 0 },
  logoBox: {
    position: "absolute", top: 18, left: 30,
    width: 52, height: 52, backgroundColor: ORANGE, borderRadius: 4,
    alignItems: "center", justifyContent: "center",
  },
  logoTxt: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 18, lineHeight: 1 },
  logoSub: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 5.5, letterSpacing: 1, marginTop: 3 },
  headerTitle: {
    position: "absolute", top: 32, left: 100, right: 140,
    fontSize: 22, fontFamily: "Helvetica-Bold", color: ORANGE,
  },

  // ---- BODY ----
  body: { paddingHorizontal: 30, paddingTop: 2 },
  row: { flexDirection: "row", gap: 8, marginBottom: 6 },
  pill: {
    backgroundColor: PILL_BG, borderRadius: 20,
    paddingVertical: 5, paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center", flex: 1, minHeight: 22,
  },
  pillLabel: { color: PILL_LABEL, fontFamily: "Helvetica-Bold", fontSize: 9, marginRight: 5 },
  pillValue: { color: "#1a1a1a", fontSize: 9.5, flex: 1 },

  // Bloque descripción (recuadro grande)
  descBox: {
    backgroundColor: PILL_BG, borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6,
  },
  descLabel: { color: PILL_LABEL, fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 6 },
  descText: { fontSize: 9.5, lineHeight: 1.4, minHeight: 60 },

  // Texto de responsabilidad
  declaration: {
    marginTop: 4, paddingHorizontal: 30, marginBottom: 8,
    fontSize: 9, lineHeight: 1.4, textAlign: "justify",
  },

  // Firma
  signatureBlock: {
    alignItems: "center", marginTop: 2, marginBottom: 2, paddingHorizontal: 30,
  },
  signatureArea: { height: 42, alignItems: "center", justifyContent: "center" },
  signatureImg: { maxHeight: 40, maxWidth: 160, objectFit: "contain" },
  signatureName: { fontSize: 10.5, marginTop: 0 },
  signatureCaptionBar: {
    marginTop: 4, backgroundColor: PILL_BG, borderRadius: 20,
    paddingVertical: 5, paddingHorizontal: 20, alignSelf: "stretch",
    marginHorizontal: 30, alignItems: "center",
  },
  signatureCaption: { fontSize: 9.5, color: PILL_LABEL, fontFamily: "Helvetica-Bold" },

  // Aviso importante
  importantNote: {
    paddingHorizontal: 30, marginTop: 6, fontSize: 9, lineHeight: 1.35,
    fontFamily: "Helvetica-Bold",
  },
  importantNoteBody: {
    fontFamily: "Helvetica",
  },

  // Franja naranja 48 hrs
  highlight: {
    marginTop: 6, marginHorizontal: 0,
    color: ORANGE, textAlign: "center",
    fontFamily: "Helvetica-Bold", fontSize: 11.5,
    paddingHorizontal: 30, lineHeight: 1.2,
  },

  // Aviso privacidad
  privacy: {
    paddingHorizontal: 30, marginTop: 10,
    fontSize: 7.5, lineHeight: 1.4, textAlign: "justify", color: "#333",
  },
  privacyBold: { fontFamily: "Helvetica-Bold" },

  // Footer azul
  footerBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: NAVY, paddingVertical: 10, paddingHorizontal: 30,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  footerCol: { color: "#FFFFFF", fontSize: 8.5, flex: 1, textAlign: "center" },
  footerColLeft: { color: "#FFFFFF", fontSize: 8.5, flex: 1, textAlign: "left" },
  footerColRight: { color: "#FFFFFF", fontSize: 8.5, flex: 1.4, textAlign: "right" },

  footerSvg: { position: "absolute", bottom: 34, left: 0 },
  rightMidSvg: { position: "absolute", right: 0, top: 340 },
});

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillLabel}>{label}</Text>
      <Text style={s.pillValue}>{value}</Text>
    </View>
  );
}

export function MedicalPassHIR(props: MedicalPassHIRProps) {
  const snap = props.snapshot ?? {};
  const sum = snap.sum_insured != null && snap.sum_insured !== "" ? formatCurrency(snap.sum_insured as any) : "—";
  const ded = snap.deductible != null && snap.deductible !== "" ? formatCurrency(snap.deductible as any) : "—";
  const directorName = props.director_name || "Graciela Rivera Bersoza";

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* ---- HEADER decorativo ---- */}
        <View style={s.headerWrap}>
          <Svg width={612} height={110} style={s.headerSvg}>
            {/* círculo naranja grande esquina sup-derecha */}
            <Circle cx={612} cy={0} r={92} fill={ORANGE} />
            {/* azul pequeño */}
            <Circle cx={505} cy={38} r={22} fill="#1E4A8A" />
            {/* naranja más pequeño ghost */}
            <Circle cx={452} cy={18} r={16} fill={ORANGE} fillOpacity={0.85} />
          </Svg>
          <View style={s.logoBox}>
            <Text style={s.logoTxt}>HIR</Text>
            <Text style={s.logoSub}>SEGUROS</Text>
          </View>
          <Text style={s.headerTitle}>CARTA AVISO DE ACCIDENTE</Text>
        </View>

        {/* círculo teal medio-derecha */}
        <Svg width={40} height={90} style={s.rightMidSvg}>
          <Circle cx={40} cy={45} r={28} fill={TEAL} />
        </Svg>

        {/* ---- BODY ---- */}
        <View style={s.body}>
          <View style={s.row}>
            <Pill label="Nombre del Contratante:" value={safe(snap.contracting_party)} />
          </View>

          <View style={s.row}>
            <Pill label="N° de Póliza:" value={safe(snap.policy_number)} />
            <Pill label="Nombre del asegurado:" value={safe(snap.insured_name)} />
          </View>

          <View style={s.row}>
            <Pill label="Fecha de nacimiento:" value={formatDate(snap.date_of_birth)} />
            <Pill label="CURP:" value={safe(snap.curp)} />
          </View>

          <View style={s.row}>
            <Pill label="N° de Certificado:" value={safe(snap.certificate_number)} />
            <Pill label="Suma Asegurada:" value={sum} />
          </View>

          <View style={s.row}>
            <Pill label="Deducible:" value={ded} />
            <Pill label="Fecha del accidente:" value={formatDate(snap.incident_date)} />
            <Pill label="Hora:" value={safe(snap.incident_time)} />
          </View>

          <View style={s.descBox}>
            <Text style={s.descLabel}>Descripción detallada del accidente (lugar y cómo ocurrió):</Text>
            <Text style={s.descText}>{safe(snap.incident_description)}</Text>
          </View>

          <View style={s.row}>
            <Pill label="Hospital al que se dirige:" value={safe(snap.hospital_name)} />
          </View>
        </View>

        {/* ---- Declaración ---- */}
        <Text style={s.declaration}>
          Hacemos constar que el accidente mencionado ocurrió dentro de la cobertura de
          actividades y/o horarios laborales/escolares; así mismo hacemos constar que la
          persona accidentada se encuentra registrada en nuestra institución, además
          reiteramos que los gastos que excedan la suma asegurada contratada no serán
          cubiertos por HIR Seguros.
        </Text>

        {/* ---- Firma ---- */}
        <View style={s.signatureBlock}>
          <View style={s.signatureArea}>
            {props.director_signature_url ? (
              <Image src={props.director_signature_url} style={s.signatureImg} />
            ) : null}
          </View>
          <Text style={s.signatureName}>{directorName}</Text>
        </View>
        <View style={s.signatureCaptionBar}>
          <Text style={s.signatureCaption}>
            Nombre y firma del Director o Autoridad (correspondiente) (Sello)
          </Text>
        </View>

        {/* ---- Aviso importante ---- */}
        <Text style={s.importantNote}>
          Importante: <Text style={s.importantNoteBody}>
            La presente no implica la aceptación de la reclamación y/o autorización
            para atención en Pago Directo por parte de HIR Seguros, solo es de
            carácter informativo.
          </Text>
        </Text>

        {/* ---- 48 hrs ---- */}
        <Text style={s.highlight}>
          ESTE PASE TIENE UNA VIGENCIA DE ATENCIÓN HASTA 48 HRS DESPUÉS DE
          OCURRIDO EL ACCIDENTE
        </Text>

        {/* ---- Aviso privacidad ---- */}
        <Text style={s.privacy}>
          <Text style={s.privacyBold}>AVISO DE PRIVACIDAD: </Text>
          HIR Compañía de Seguros S.A. de C.V. es responsable del tratamiento de sus
          datos personales, sensibles y patrimoniales, con domicilio en
          <Text style={s.privacyBold}> Hermes 28, colonia Crédito Constructor,
          Alcaldía Benito Juárez, C.P. 03940, Ciudad de México</Text> y utilizará
          sus datos personales aquí recabados para contacto, evaluación de solicitud
          de seguro, asesoría durante la relación del seguro, dictaminar, tramitar
          solicitudes de siniestros, prevención de operaciones ilícitas, así como la
          remisión de dichos datos a otras instituciones de seguros.
        </Text>
        <Text style={[s.privacy, { marginTop: 4 }]}>
          Para mayor información acerca del tratamiento y de los derechos que puede
          hacer valer, usted puede acceder al Aviso de Privacidad completo a través
          de la página web <Text style={s.privacyBold}>www.hirseguros.mx</Text>, al
          teléfono <Text style={s.privacyBold}>800 7348 447</Text> o a través del
          correo <Text style={s.privacyBold}>contacto@hirseguros.com.mx</Text>
        </Text>

        {/* círculos naranja/teal esquina inferior izquierda */}
        <Svg width={130} height={90} style={s.footerSvg}>
          <Circle cx={0} cy={90} r={45} fill={ORANGE} />
          <Circle cx={55} cy={65} r={16} fill={TEAL} />
        </Svg>

        {/* ---- Franja azul ---- */}
        <View style={s.footerBar} fixed>
          <Text style={s.footerColLeft}>✉  www.hirseguros.mx</Text>
          <Text style={s.footerCol}>☎  5262 1780  |  800 7348 447</Text>
          <Text style={s.footerColRight}>
            ⌖  Hermes 28, Col. Crédito Constructor,{"\n"}Alc. Benito Juárez, CDMX, C.P. 3940
          </Text>
        </View>
      </Page>
    </Document>
  );
}
