// Centralized helper that renders a React-PDF Document to a Uint8Array buffer.
import type { ReactElement } from "react";

export async function renderPdfToBytes(doc: ReactElement<any>): Promise<Uint8Array> {
  const { pdf } = await import("@react-pdf/renderer");
  const instance = pdf(doc as any);
  const blob = await instance.toBlob();
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}
