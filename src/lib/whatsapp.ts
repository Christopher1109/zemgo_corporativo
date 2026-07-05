// WhatsApp messaging — interface ready, implementation is a stub.
// When system_config 'whatsapp.enabled' becomes true, swap StubSender with MetaCloudSender.
//
// -----------------------------------------------------------------------------
// PLANTILLAS AUTOMÁTICAS DESACTIVADAS (decisión de negocio, jul 2026)
// -----------------------------------------------------------------------------
// El disparo automático de plantillas de BIENVENIDA y CONFIRMACIÓN al alta
// desde el formulario público quedó deshabilitado para reducir costos de
// mensajería. El acceso al Portal ahora se valida contra base de datos
// (CURP + últimos 4 del teléfono) en vez de OTP por WhatsApp.
//
// La ÚNICA plantilla que sigue disparándose automáticamente es la de
// RECORDATORIO DE PAGO, manejada por la RPC `run_payment_housekeeping`
// (mira supabase/migrations y src/routes/api/public/hooks/payment-housekeeping.ts).
//
// Para reactivar bienvenida/confirmación en el futuro:
//   1. Implementar MetaCloudSender aquí (ver supabase/functions/whatsapp-webhook).
//   2. Reintroducir la llamada `whatsapp.sendTemplate(...)` en el flujo de alta
//      (sheets-sync / clients.new).
//   3. Actualizar system_config 'whatsapp.enabled' = true.
// -----------------------------------------------------------------------------

export interface WhatsAppSender {
  sendTemplate(
    to: string,
    templateId: string,
    variables: Record<string, string>,
  ): Promise<{ messageId: string }>;
}

export class StubSender implements WhatsAppSender {
  async sendTemplate(to: string, templateId: string, variables: Record<string, string>) {
    console.log("[whatsapp:stub] →", to, templateId, variables);
    return { messageId: `stub-${Date.now()}` };
  }
}

export const whatsapp: WhatsAppSender = new StubSender();
