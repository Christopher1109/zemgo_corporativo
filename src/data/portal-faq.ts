// Editable FAQ content for the portal chatbot widget.
// Update the strings below to change the answers users see — no code changes required.

export type FaqItem = {
  q: string;
  a: string;
};

export const PORTAL_FAQ: FaqItem[] = [
  {
    q: "¿Cómo descargo mi certificado?",
    a: "Entra a la sección 'Certificados' del portal y presiona 'Descargar certificado' en la póliza que quieras. Se abrirá el PDF en una nueva pestaña.",
  },
  {
    q: "¿Cómo reporto un siniestro?",
    a: "Ve a 'Siniestros' → 'Reportar siniestro', llena la información del evento y súbelo. Al finalizar podrás descargar de inmediato tu Carta Aviso de Accidente.",
  },
  {
    q: "¿Dónde veo la lista de hospitales?",
    a: "Al reportar un siniestro te mostramos los hospitales autorizados según tu programa, ordenados por cercanía si aceptas compartir tu ubicación.",
  },
  {
    q: "¿Cuándo se activa mi cobertura?",
    a: "Tu cobertura se activa cuando confirmamos tu primer pago. Normalmente es en minutos si pagaste con tarjeta.",
  },
  {
    q: "¿Cómo actualizo mis datos o beneficiarios?",
    a: "Entra a 'Mis Datos' y edita la información que necesites. Los cambios en beneficiarios se registran de inmediato.",
  },
  {
    q: "¿A quién contacto en caso de urgencia?",
    a: "Marca al teléfono 24/7 que aparece al pie de tu certificado o abre 'Reportar siniestro' para dejar constancia digital.",
  },
];
