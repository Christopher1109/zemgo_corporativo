// Centralized helper that renders a React-PDF Document to a Uint8Array buffer.
// Uses the Node API (`renderToBuffer`) so it works server-side in the Worker.
import type { ReactElement } from "react";

export async function renderPdfToBytes(doc: ReactElement<any>): Promise<Uint8Array> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(doc as any);
  // `buffer` is a Node Buffer (Uint8Array subclass) — return as plain Uint8Array.
  return new Uint8Array(buffer);
}
