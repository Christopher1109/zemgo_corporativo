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
    a: [
      "Sigue estos pasos para activar tu cobertura:",
      "1. Ingresa al portal y entra a 'Siniestros' → 'Reportar siniestro'.",
      "2. Llena el Aviso de Accidente con los datos del evento y una descripción.",
      "3. Acude al hospital y muestra el Aviso de Accidente que se genera.",
      "4. Solicita tu folio de Ingreso Hospitalario.",
      "5. Una vez aprobado el dictamen (aprox. 4 horas), pasa a caja del hospital a pagar el deducible.",
      "Puedes ver el paso a paso completo por programa en la sección 'Alcance'.",
    ].join("\n"),
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
