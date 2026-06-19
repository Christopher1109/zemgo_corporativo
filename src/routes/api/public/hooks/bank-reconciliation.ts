// Bank reconciliation webhook
// Expected request:
//   POST /api/public/hooks/bank-reconciliation
//   Headers: x-bank-signature: <hex hmac sha256 of raw body using BANK_WEBHOOK_SECRET>
//   Body: { "referencia": "HOPE-ABC-...", "monto": 100.00, "fecha_pago": "2026-06-19T12:00:00Z", "auth_code"?: "..." }
//
// Returns 200 with { status: "matched"|"duplicate"|"not_found"|"amount_mismatch" }.
// Always logs the attempt to public.bank_reconciliation_log for debugging.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const BodySchema = z.object({
  referencia: z.string().min(4),
  monto: z.number().positive(),
  fecha_pago: z.string().optional(),
  auth_code: z.string().optional(),
  external_id: z.string().optional(),
});

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.BANK_WEBHOOK_SECRET;
  if (!secret) return false; // fail-closed in production
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = Buffer.from(header.trim());
  const exp = Buffer.from(expected);
  if (sig.length !== exp.length) return false;
  return timingSafeEqual(sig, exp);
}

async function logAttempt(params: {
  status: string;
  reference?: string | null;
  amount?: number | null;
  payment_id?: string | null;
  error_message?: string | null;
  raw_payload?: unknown;
  source_ip?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin.from("bank_reconciliation_log") as any).insert({
      status: params.status,
      reference: params.reference ?? null,
      amount: params.amount ?? null,
      payment_id: params.payment_id ?? null,
      error_message: params.error_message ?? null,
      raw_payload: (params.raw_payload ?? null) as any,
      source_ip: params.source_ip ?? null,
    });
  } catch {
    // swallow — logging must never break the webhook response
  }
}

export const Route = createFileRoute("/api/public/hooks/bank-reconciliation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const sourceIp =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for") ??
          null;

        if (!verifySignature(rawBody, request.headers.get("x-bank-signature"))) {
          await logAttempt({
            status: "invalid_signature",
            raw_payload: { body: rawBody.slice(0, 1000) },
            source_ip: sourceIp,
          });
          return new Response(
            JSON.stringify({ status: "invalid_signature" }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
        }

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(JSON.parse(rawBody));
        } catch (err) {
          await logAttempt({
            status: "invalid_payload",
            error_message: (err as Error).message,
            raw_payload: { body: rawBody.slice(0, 1000) },
            source_ip: sourceIp,
          });
          return new Response(
            JSON.stringify({ status: "invalid_payload" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rpcRes, error: rpcErr } = await (supabaseAdmin.rpc as any)(
          "reconcile_payment_by_reference",
          {
            _reference: parsed.referencia,
            _amount: parsed.monto,
            _paid_at: parsed.fecha_pago ?? new Date().toISOString(),
            _external_id: parsed.external_id ?? parsed.auth_code ?? null,
            _raw: parsed,
            _source: "webhook",
          },
        );

        if (rpcErr) {
          await logAttempt({
            status: "error",
            reference: parsed.referencia,
            amount: parsed.monto,
            error_message: rpcErr.message,
            raw_payload: parsed,
            source_ip: sourceIp,
          });
          return new Response(
            JSON.stringify({ status: "error", message: rpcErr.message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }

        const result = rpcRes as { status: string; payment_id?: string };
        await logAttempt({
          status: result.status,
          reference: parsed.referencia,
          amount: parsed.monto,
          payment_id: result.payment_id ?? null,
          raw_payload: parsed,
          source_ip: sourceIp,
        });

        const httpStatus = result.status === "matched" || result.status === "duplicate" ? 200 : 422;
        return new Response(JSON.stringify(result), {
          status: httpStatus,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
