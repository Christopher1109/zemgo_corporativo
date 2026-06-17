// Smoke test endpoint to confirm @react-pdf/renderer runs in the Worker SSR
// runtime of Lovable Cloud. Returns the rendered byte length.
//
// Safe to keep: it's auth-gated and produces no side effects.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderPdfToBytes } from "./render";
import { SmokeTestDoc } from "./templates/SmokeTest";

export const pdfSmokeTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const bytes = await renderPdfToBytes(<SmokeTestDoc label="smoke" />);
    return { ok: true, bytes: bytes.byteLength };
  });
