import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const beneficiarySchema = z.object({
  full_name: z.string().min(1),
  relationship: z.string().min(1),
  percentage: z.number().min(0).max(100),
});

const dependentSchema = z.object({
  full_name: z.string().min(1),
  relationship: z.string().min(1),
  date_of_birth: z.string().optional().nullable(),
});

const createPolicySchema = z.object({
  client_id: z.string().uuid(),
  program_id: z.string().uuid(),
  issue_date: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  contracting_party: z.string().optional().nullable(),
  contractor_id: z.string().uuid().optional().nullable(),
  premium: z.number().optional().nullable(),
  sum_insured: z.number().optional().nullable(),
  beneficiaries: z.array(beneficiarySchema).min(1).max(2),
  dependents: z.array(dependentSchema).optional().default([]),
});

export const createPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createPolicySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const sum = data.beneficiaries.reduce((s, b) => s + b.percentage, 0);
    if (Math.round(sum) !== 100) throw new Error("Los porcentajes de beneficiarios deben sumar 100%");

    const { data: enrollment, error: enrollmentErr } = await supabase
      .from("client_programs")
      .select("id")
      .eq("client_id", data.client_id)
      .eq("program_id", data.program_id)
      .neq("status", "cancelled")
      .maybeSingle();
    if (enrollmentErr) throw enrollmentErr;
    if (!enrollment) {
      throw new Error("Este cliente no está afiliado al programa seleccionado. Guárdalo primero en este programa.");
    }

    const { data: folio, error: folioErr } = await supabase.rpc("next_policy_folio", {
      _program_id: data.program_id,
    });
    if (folioErr) throw folioErr;

    // Fetch the program's configured HIR policy number (may be null until set in Settings → Póliza)
    const { data: prog } = await supabase
      .from("programs")
      .select("policy_number")
      .eq("id", data.program_id)
      .maybeSingle();

    const { data: policy, error: insErr } = await supabase
      .from("policies")
      .insert({
        client_id: data.client_id,
        program_id: data.program_id,
        folio: folio as string,
        policy_number: prog?.policy_number ?? null,
        certificate_number: folio as string,
        issue_date: data.issue_date,
        start_date: data.start_date,
        end_date: data.end_date,
        contracting_party: data.contracting_party ?? null,
        contractor_id: data.contractor_id ?? null,
        premium: data.premium ?? null,
        sum_insured: data.sum_insured ?? null,
        status: "draft",
        created_by: userId,
      })
      .select("id, folio")
      .single();
    if (insErr) throw insErr;

    const benRows = data.beneficiaries.map((b, i) => ({
      policy_id: policy.id,
      full_name: b.full_name,
      relationship: b.relationship,
      percentage: b.percentage,
      display_order: i,
    }));
    const { error: benErr } = await supabase.from("beneficiaries").insert(benRows);
    if (benErr) throw benErr;

    if (data.dependents && data.dependents.length > 0) {
      const depRows = data.dependents.map((d) => ({
        policy_id: policy.id,
        full_name: d.full_name,
        relationship: d.relationship,
        date_of_birth: d.date_of_birth ?? null,
      }));
      const { error: depErr } = await supabase.from("dependents").insert(depRows);
      if (depErr) throw depErr;
    }

    await supabase.from("audit_log").insert({
      user_id: userId,
      program_id: data.program_id,
      entity_type: "policy",
      entity_id: policy.id,
      action: "create",
      diff: { folio: policy.folio, status: "draft" },
    });

    return { id: policy.id, folio: policy.folio };
  });

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_payment", "cancelled"],
  pending_payment: ["active", "cancelled"],
  active: ["expired", "cancelled", "suspended"],
  suspended: ["active", "cancelled"],
};

export const changePolicyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        policy_id: z.string().uuid(),
        next_status: z.enum(["draft", "pending_payment", "active", "expired", "cancelled", "suspended"]),
        reason: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pol, error } = await supabase
      .from("policies")
      .select("id, status, program_id")
      .eq("id", data.policy_id)
      .single();
    if (error) throw error;

    const allowed = ALLOWED_TRANSITIONS[pol.status] ?? [];
    if (!allowed.includes(data.next_status))
      throw new Error(`Transición no permitida: ${pol.status} → ${data.next_status}`);

    if (data.next_status === "cancelled" && !data.reason)
      throw new Error("Debes indicar el motivo de cancelación");

    const { error: updErr } = await supabase
      .from("policies")
      .update({ status: data.next_status })
      .eq("id", data.policy_id);
    if (updErr) throw updErr;

    await supabase.from("audit_log").insert({
      user_id: userId,
      program_id: pol.program_id,
      entity_type: "policy",
      entity_id: pol.id,
      action: `status:${pol.status}->${data.next_status}`,
      diff: { from: pol.status, to: data.next_status, reason: data.reason ?? null },
    });

    if (data.next_status === "active") {
      const { error: schedErr } = await supabase.rpc("create_payment_schedule_for_policy", {
        _policy_id: data.policy_id,
      });
      if (schedErr) throw schedErr;
    }

    return { ok: true };
  });

export const generateCertificatePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ policy_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch policy with relations (RLS as caller — verifies access)
    const { data: pol, error } = await supabase
      .from("policies")
      .select(
        "id, folio, policy_number, certificate_number, issue_date, start_date, end_date, contracting_party, premium, sum_insured, status, program_id, programs(name, code, color_primary), clients(first_name, last_name, curp), beneficiaries(full_name, relationship, percentage)",
      )
      .eq("id", data.policy_id)
      .single();
    if (error) throw error;

    const { renderCertificateWithPdfLib } = await import("@/lib/pdf/pdf-lib-renderers.server");
    const bytes = await renderCertificateWithPdfLib({
      policy: pol as any,
      program: (pol as any).programs,
      client: (pol as any).clients,
      beneficiaries: ((pol as any).beneficiaries ?? []) as any[],
    });

    // Upload via service role to a path that program-members can read.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${pol.program_id}/${pol.id}/${pol.folio}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("certificates")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("certificates")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (sErr) throw sErr;

    await supabase
      .from("policies")
      .update({ certificate_pdf_url: signed.signedUrl })
      .eq("id", pol.id);

    await supabase.from("audit_log").insert({
      user_id: userId,
      program_id: pol.program_id,
      entity_type: "policy",
      entity_id: pol.id,
      action: "generate_certificate_pdf",
      diff: { path },
    });

    return { url: signed.signedUrl, path };
  });
