// WhatsApp messaging — interface ready, implementation is a stub.
// When system_config 'whatsapp.enabled' becomes true, swap StubSender with MetaCloudSender.

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
