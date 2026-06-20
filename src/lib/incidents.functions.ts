import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Internal: shared by the public issueMedicalPass server fn AND auto-issue on reportIncident.
async function issueMedicalPassImpl(
  context: { supabase: any; userId: string },
  data: { incident_id: string; director_id: string; hospital: string },
): Promise<{ pass_id: string; path: string }> {
  const { supabase, userId } = context;
  const { data: passId, error } = await (supabase.rpc as any)("issue_medical_pass", {
    _incident_id: data.incident_id,
    _director_id: data.director_id,
    _hospital: data.hospital,
  });
  if (error) throw new Error(error.message);

  const { data: pass } = await supabase
    .from("medical_passes")
    .select("id, valid_from, valid_until, snapshot, director_name, policy_id")
    .eq("id", passId as string)
    .single();
  if (!pass) throw new Error("pass_not_found_after_insert");

  const snap = (pass.snapshot ?? {}) as Record<string, any>;
  const programCode = (snap.program_code ?? "GEN") as string;

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.05, 0.15, 0.45) });
  page.drawText("HIR SEGUROS", { x: 40, y: 762, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText("PASE MÉDICO — PLACEHOLDER", { x: 40, y: 748, size: 9, font, color: rgb(1, 1, 1) });

  let y = 710;
  const line = (label: string, value: string) => {
    page.drawText(label, { x: 40, y, size: 10, font: bold });
    page.drawText(String(value ?? "—"), { x: 200, y, size: 10, font });
    y -= 16;
  };
  line("Pase #:", pass.id);
  line("Programa:", `${programCode} — ${snap.program_name ?? ""}`);
  line("Folio certificado:", snap.folio ?? "—");
  line("No. Certificado HIR:", snap.policy_number ?? "—");
  line("No. Certificado:", snap.certificate_number ?? "—");
  line("Contratante:", snap.contracting_party ?? "—");
  y -= 6;
  line("Asegurado:", snap.insured_name ?? "—");
  line("CURP:", snap.insured_curp ?? "—");
  line("Fecha nacimiento:", snap.insured_dob ?? "—");
  line("Suma asegurada:", snap.sum_insured ? `$${snap.sum_insured}` : "—");
  line("Deducible:", snap.deductible ? `$${snap.deductible}` : "—");
  y -= 6;
  line("Fecha accidente:", `${snap.accident_date ?? "—"} ${snap.accident_time ?? ""}`);
  line("Hospital:", snap.hospital ?? "—");
  y -= 10;
  page.drawText("Descripción:", { x: 40, y, size: 10, font: bold }); y -= 14;
  const desc = String(snap.accident_description ?? "—");
  for (const chunk of desc.match(/.{1,80}/g) ?? [desc]) {
    page.drawText(chunk, { x: 40, y, size: 9, font }); y -= 12;
  }
  y -= 20;
  page.drawRectangle({ x: 40, y: y - 30, width: 532, height: 40, color: rgb(0.95, 0.85, 0.2) });
  page.drawText(
    `VIGENCIA 48 HRS — VENCE: ${new Date(pass.valid_until).toLocaleString("es-MX")}`,
    { x: 60, y: y - 12, size: 12, font: bold, color: rgb(0, 0, 0) },
  );
  y -= 60;
  page.drawText(`Director que autoriza: ${pass.director_name ?? "—"}`, { x: 40, y, size: 10, font });
  y -= 14;
  page.drawText(`Emitido: ${new Date(pass.valid_from).toLocaleString("es-MX")}`, { x: 40, y, size: 9, font });

  const bytes = await pdf.save();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = new Date();
  const path = `${programCode}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${pass.id}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("medical-passes")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;

  const { error: setErr } = await (supabase.rpc as any)("set_medical_pass_pdf_url", {
    _pass_id: pass.id, _pdf_url: path,
  });
  if (setErr) throw new Error(setErr.message);

  void userId;
  return { pass_id: pass.id as string, path };
}


export const reportIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      policy_id: z.string().uuid(),
      accident_date: z.string(),
      accident_time: z.string().nullable().optional(),
      location: z.string().max(500).nullable().optional(),
      description: z.string().min(20).max(2000),
      hospital: z.string().max(200).nullable().optional(),
      auto_issue_pass: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase.rpc as any)("report_incident", {
      _policy_id: data.policy_id,
      _accident_date: data.accident_date,
      _accident_time: data.accident_time ?? null,
      _location: data.location ?? null,
      _description: data.description,
      _hospital: data.hospital ?? null,
    });
    if (error) throw new Error(error.message);
    const incidentId = id as string;

    // Best-effort auto-emit: requires hospital + caller having admin/manager/claims in the program
    // + at least one admin/manager available as "director que autoriza".
    let auto_pass: { pass_id: string; path: string } | null = null;
    let auto_pass_error: string | null = null;
    if (data.auto_issue_pass && data.hospital && data.hospital.trim().length > 0) {
      try {
        const { data: pol } = await context.supabase
          .from("policies").select("program_id").eq("id", data.policy_id).single();
        if (pol?.program_id) {
          const { data: dirs } = await context.supabase
            .from("user_program_access")
            .select("user_id, role, profiles!inner(id, full_name)")
            .eq("program_id", pol.program_id)
            .in("role", ["admin", "manager"])
            .limit(1);
          const directorId = (dirs?.[0] as any)?.user_id as string | undefined;
          if (directorId) {
            auto_pass = await issueMedicalPassImpl(context, {
              incident_id: incidentId,
              director_id: directorId,
              hospital: data.hospital,
            });
          } else {
            auto_pass_error = "no_director_available";
          }
        }
      } catch (e: any) {
        auto_pass_error = String(e?.message ?? e);
      }
    }

    return { incident_id: incidentId, auto_pass, auto_pass_error };
  });

export const rejectIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ incident_id: z.string().uuid(), reason: z.string().min(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("reject_incident", {
      _incident_id: data.incident_id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeMedicalPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ pass_id: z.string().uuid(), reason: z.string().min(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("revoke_medical_pass", {
      _pass_id: data.pass_id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const issueMedicalPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      incident_id: z.string().uuid(),
      director_id: z.string().uuid(),
      hospital: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: passId, error } = await (supabase.rpc as any)("issue_medical_pass", {
      _incident_id: data.incident_id,
      _director_id: data.director_id,
      _hospital: data.hospital,
    });
    if (error) throw new Error(error.message);

    // Generate placeholder PDF
    const { data: pass } = await supabase
      .from("medical_passes")
      .select("id, valid_from, valid_until, snapshot, director_name, policy_id")
      .eq("id", passId as string)
      .single();
    if (!pass) throw new Error("pass_not_found_after_insert");

    const snap = (pass.snapshot ?? {}) as Record<string, any>;
    const programCode = (snap.program_code ?? "GEN") as string;

    // ====== PDF GENERATION (PLACEHOLDER) ======
    // TODO(HIR template): cuando se entregue el HTML/PDF oficial de HIR Seguros
    // para el pase médico, reemplazar este bloque entero por un render basado
    // en ese template. Toda la info necesaria está en `pass.snapshot`.
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.05, 0.15, 0.45) });
    page.drawText("HIR SEGUROS", { x: 40, y: 762, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText("PASE MÉDICO — PLACEHOLDER", { x: 40, y: 748, size: 9, font, color: rgb(1, 1, 1) });

    let y = 710;
    const line = (label: string, value: string) => {
      page.drawText(label, { x: 40, y, size: 10, font: bold });
      page.drawText(String(value ?? "—"), { x: 200, y, size: 10, font });
      y -= 16;
    };

    line("Pase #:", pass.id);
    line("Programa:", `${programCode} — ${snap.program_name ?? ""}`);
    line("Folio certificado:", snap.folio ?? "—");
    line("No. Certificado HIR:", snap.policy_number ?? "—");
    line("No. Certificado:", snap.certificate_number ?? "—");
    line("Contratante:", snap.contracting_party ?? "—");
    y -= 6;
    line("Asegurado:", snap.insured_name ?? "—");
    line("CURP:", snap.insured_curp ?? "—");
    line("Fecha nacimiento:", snap.insured_dob ?? "—");
    line("Suma asegurada:", snap.sum_insured ? `$${snap.sum_insured}` : "—");
    line("Deducible:", snap.deductible ? `$${snap.deductible}` : "—");
    y -= 6;
    line("Fecha accidente:", `${snap.accident_date ?? "—"} ${snap.accident_time ?? ""}`);
    line("Hospital:", snap.hospital ?? "—");
    y -= 10;
    page.drawText("Descripción:", { x: 40, y, size: 10, font: bold }); y -= 14;
    const desc = String(snap.accident_description ?? "—");
    for (const chunk of desc.match(/.{1,80}/g) ?? [desc]) {
      page.drawText(chunk, { x: 40, y, size: 9, font }); y -= 12;
    }

    y -= 20;
    page.drawRectangle({ x: 40, y: y - 30, width: 532, height: 40, color: rgb(0.95, 0.85, 0.2) });
    page.drawText(
      `VIGENCIA 48 HRS — VENCE: ${new Date(pass.valid_until).toLocaleString("es-MX")}`,
      { x: 60, y: y - 12, size: 12, font: bold, color: rgb(0, 0, 0) },
    );
    y -= 60;

    page.drawText(`Director que autoriza: ${pass.director_name ?? "—"}`, { x: 40, y, size: 10, font });
    y -= 14;
    page.drawText(`Emitido: ${new Date(pass.valid_from).toLocaleString("es-MX")}`, { x: 40, y, size: 9, font });

    const bytes = await pdf.save();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = new Date();
    const path = `${programCode}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${pass.id}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("medical-passes")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { error: setErr } = await (supabase.rpc as any)("set_medical_pass_pdf_url", {
      _pass_id: pass.id, _pdf_url: path,
    });
    if (setErr) throw new Error(setErr.message);

    void userId;
    return { pass_id: pass.id as string, path };
  });

export const getMedicalPassSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pass_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Verify access + not revoked through RLS-aware read
    const { data: pass, error } = await context.supabase
      .from("medical_passes")
      .select("id, pdf_url, revoked_at")
      .eq("id", data.pass_id)
      .single();
    if (error) throw new Error(error.message);
    if (!pass.pdf_url) throw new Error("pdf_not_generated");
    if (pass.revoked_at) throw new Error("pass_revoked");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("medical-passes")
      .createSignedUrl(pass.pdf_url, 60 * 60); // 1 hour
    if (sErr) throw sErr;
    return { url: signed.signedUrl };
  });
