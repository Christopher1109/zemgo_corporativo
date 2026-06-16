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
  policy_number: z.string().optional().nullable(),
  certificate_number: z.string().optional().nullable(),
  issue_date: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  contracting_party: z.string().optional().nullable(),
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

    const { data: folio, error: folioErr } = await supabase.rpc("next_policy_folio", {
      _program_id: data.program_id,
    });
    if (folioErr) throw folioErr;

    const { data: policy, error: insErr } = await supabase
      .from("policies")
      .insert({
        client_id: data.client_id,
        program_id: data.program_id,
        folio: folio as string,
        policy_number: data.policy_number ?? null,
        certificate_number: data.certificate_number ?? null,
        issue_date: data.issue_date,
        start_date: data.start_date,
        end_date: data.end_date,
        contracting_party: data.contracting_party ?? null,
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

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const hex = (pol as any).programs?.color_primary ?? "#333333";
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(r, g, b) });
    page.drawText("HOPE CONSULTING", { x: 40, y: 760, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText((pol as any).programs?.name ?? "", { x: 40, y: 746, size: 10, font, color: rgb(1, 1, 1) });

    let y = 700;
    const line = (label: string, value: string) => {
      page.drawText(label, { x: 40, y, size: 10, font: bold });
      page.drawText(value, { x: 200, y, size: 10, font });
      y -= 18;
    };
    page.drawText("CERTIFICADO DE COBERTURA", { x: 40, y, size: 14, font: bold });
    y -= 28;
    line("Folio:", pol.folio);
    line("No. Póliza HIR:", pol.policy_number ?? "—");
    line("No. Certificado:", pol.certificate_number ?? "—");
    line("Titular:", `${(pol as any).clients?.first_name ?? ""} ${(pol as any).clients?.last_name ?? ""}`);
    line("CURP:", (pol as any).clients?.curp ?? "—");
    line("Contratante:", pol.contracting_party ?? "—");
    line("Emisión:", pol.issue_date ?? "—");
    line("Vigencia:", `${pol.start_date ?? "—"}  al  ${pol.end_date ?? "—"}`);
    line("Prima:", pol.premium ? `$${pol.premium}` : "—");
    line("Suma asegurada:", pol.sum_insured ? `$${pol.sum_insured}` : "—");

    y -= 10;
    page.drawText("BENEFICIARIOS", { x: 40, y, size: 12, font: bold });
    y -= 18;
    for (const ben of ((pol as any).beneficiaries ?? []) as any[]) {
      page.drawText(`• ${ben.full_name}  (${ben.relationship})  —  ${ben.percentage}%`, {
        x: 50, y, size: 10, font,
      });
      y -= 14;
    }

    y -= 20;
    page.drawText("[Placeholder] El layout definitivo del certificado se aplicará cuando se entregue el HTML oficial.", {
      x: 40, y, size: 8, font, color: rgb(0.5, 0.5, 0.5),
    });

    const bytes = await pdf.save();

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
