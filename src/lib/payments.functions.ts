import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const methodEnum = z.enum(["bank_transfer", "cash", "manual", "bank_reference", "card", "oxxo"]);

export const markPaymentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      payment_id: z.string().uuid(),
      method: methodEnum,
      paid_at: z.string(),
      reference: z.string().nullable().optional(),
      paid_amount: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      amount_change_reason: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await (supabase.rpc as any)("mark_payment_paid", {
      _payment_id: data.payment_id,
      _method: data.method,
      _paid_at: data.paid_at,
      _reference: data.reference ?? null,
      _paid_amount: data.paid_amount ?? null,
      _notes: data.notes ?? null,
      _amount_change_reason: data.amount_change_reason ?? null,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; next_payment_id: string | null };
  });

export const generateBankReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ payment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("generate_bank_reference", {
      _payment_id: data.payment_id,
    });
    if (error) throw new Error(error.message);
    return res as { reference: string; expires_at: string; reused: boolean };
  });

export const cancelPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ payment_id: z.string().uuid(), reason: z.string().min(3) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_payment", {
      _payment_id: data.payment_id, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ payment_id: z.string().uuid(), reason: z.string().min(3) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("refund_payment", {
      _payment_id: data.payment_id, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Manual trigger for the housekeeping job — useful for QA. Requires admin role anywhere. */
export const runPaymentHousekeeping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_super_admin", { _user_id: userId });
    if (!isAdmin) throw new Error("forbidden");
    const { data, error } = await supabase.rpc("run_payment_housekeeping");
    if (error) throw new Error(error.message);
    return data as { overdue: number; reminders: number; suspended: number; created: number };
  });
