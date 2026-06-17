// Centralized helper that renders a React-PDF Document to a Uint8Array buffer.
// Importing @react-pdf/renderer is heavy; doing it through this module makes
// it easy to swap engines later (html-pdf-node / jsPDF / pdf-lib) without
// touching every generator.

import type { ReactElement } from "react";

export async function renderPdfToBytes(doc: ReactElement): Promise<Uint8Array> {
  const { pdf } = await import("@react-pdf/renderer");
  const instance = pdf(doc);
  const blob = await instance.toBlob();
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}
