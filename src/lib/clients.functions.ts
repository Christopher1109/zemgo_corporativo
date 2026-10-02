import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Elimina un cliente y todo lo ligado a él (certificados, pagos, siniestros,
 * afiliaciones, sesiones del portal). Solo Superadministrador o admin/manager
 * de algún programa. Se registra en audit_log.
 */
export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ client_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verificación de rol: superadmin o admin/manager en algún programa.
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
    let allowed = Boolean(isSuper);
    if (!allowed) {
      const { data: access } = await supabase
        .from("user_program_access")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "manager"])
        .limit(1);
      allowed = (access ?? []).length > 0;
    }
    if (!allowed) throw new Error("Solo administradores pueden eliminar clientes.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cid = data.client_id;

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, first_name, last_name, curp")
      .eq("id", cid)
      .single();
    if (!client) throw new Error("Cliente no encontrado.");

    const { data: pols } = await supabaseAdmin.from("policies").select("id").eq("client_id", cid);
    const polIds = (pols ?? []).map((p: any) => p.id);
    const { data: incs } = await supabaseAdmin.from("incidents").select("id").eq("client_id", cid);
    const incIds = (incs ?? []).map((i: any) => i.id);

    // Hijos de pólizas e incidentes primero.
    if (incIds.length) {
      await supabaseAdmin.from("medical_passes").delete().in("incident_id", incIds);
    }
    if (polIds.length) {
      await supabaseAdmin.from("medical_passes").delete().in("policy_id", polIds);
      await supabaseAdmin.from("payments").delete().in("policy_id", polIds);
      await supabaseAdmin.from("payment_schedules").delete().in("policy_id", polIds);
      await supabaseAdmin.from("beneficiaries").delete().in("policy_id", polIds);
      await supabaseAdmin.from("dependents").delete().in("policy_id", polIds);
      await supabaseAdmin.from("policy_insurer_costs").delete().in("policy_id", polIds);
      await supabaseAdmin.from("policy_revisions").delete().in("policy_id", polIds);
      await supabaseAdmin.from("renewal_contacts").delete().in("policy_id", polIds);
      await supabaseAdmin.from("sales_commissions").delete().in("policy_id", polIds);
    }
    await supabaseAdmin.from("sales_commissions").delete().eq("client_id", cid);
    if (incIds.length) await supabaseAdmin.from("incidents").delete().in("id", incIds);
    if (polIds.length) await supabaseAdmin.from("policies").delete().in("id", polIds);

    // Afiliaciones, portal y documentos.
    await supabaseAdmin.from("client_programs").delete().eq("client_id", cid);
    await supabaseAdmin.from("portal_sessions").delete().eq("client_id", cid);
    await supabaseAdmin.from("portal_access_codes").delete().eq("client_id", cid);
    await supabaseAdmin.from("documents").delete().eq("owner_type", "client").eq("owner_id", cid);

    // Referencias que deben quedar en NULL (historiales).
    await supabaseAdmin.from("contractors").update({ linked_client_id: null }).eq("linked_client_id", cid);
    await supabaseAdmin.from("duplicate_curp_attempts").update({ existing_client_id: null }).eq("existing_client_id", cid);
    await supabaseAdmin.from("sheet_synced_rows").update({ client_id: null }).eq("client_id", cid);
    await supabaseAdmin.from("sales_rep_match_review").update({ client_id: null }).eq("client_id", cid);
    await supabaseAdmin.from("whatsapp_messages").update({ client_id: null }).eq("client_id", cid);

    const { error } = await supabaseAdmin.from("clients").delete().eq("id", cid);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      entity_type: "client",
      entity_id: cid,
      action: "delete_client",
      diff: { deleted: { first_name: client.first_name, last_name: client.last_name, curp: client.curp } },
    });

    return { ok: true };
  });
