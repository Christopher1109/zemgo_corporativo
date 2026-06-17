// Temporary smoke endpoint to verify @react-pdf/renderer works in the Worker
// SSR runtime. Returns JSON with the byte length of a tiny PDF.
// No PII, no DB writes — safe to leave during development, REMOVE after launch.

import { createFileRoute } from "@tanstack/react-router";
import { renderPdfToBytes } from "@/lib/pdf/render";
import { SmokeTestDoc } from "@/lib/pdf/templates/SmokeTest";

export const Route = createFileRoute("/api/public/__pdf-smoke")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const bytes = await renderPdfToBytes(<SmokeTestDoc label="smoke" />);
          return Response.json({ ok: true, bytes: bytes.byteLength });
        } catch (e: any) {
          return Response.json(
            { ok: false, error: String(e?.message ?? e), stack: String(e?.stack ?? "") },
            { status: 500 },
          );
        }
      },
    },
  },
});
