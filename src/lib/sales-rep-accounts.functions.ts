import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Create or update the login (email + password) of a sales rep and link it
 * to the sales_reps row. Admins only. The password is also kept in the rep's
 * metadata so admins can look it up later (explicit business request).
 */
export const saveSalesRepAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sales_rep_id: z.string().uuid(),
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const can = await context.supabase.rpc("can_manage_users", { _user_id: context.userId });
    if (can.error) throw new Error(can.error.message);
    if (!can.data) throw new Error("Solo administradores pueden crear accesos de vendedores");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const repQ = await supabaseAdmin
      .from("sales_reps")
      .select("id, full_name, user_id, metadata")
      .eq("id", data.sales_rep_id)
      .maybeSingle();
    if (repQ.error) throw new Error(repQ.error.message);
    if (!repQ.data) throw new Error("Vendedor no encontrado");
    const rep = repQ.data as any;

    let userId: string | null = rep.user_id ?? null;
    const admin = (supabaseAdmin as any).auth.admin;
    if (userId) {
      const { error } = await admin.updateUserById(userId, {
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: rep.full_name, sales_rep_id: rep.id },
      });
      if (error) {
        const msg = String(error.message ?? "");
        if (msg.toLowerCase().includes("already")) throw new Error("Ese correo ya está en uso por otro usuario");
        throw new Error(msg);
      }
      userId = created?.user?.id ?? null;
      if (!userId) throw new Error("No se pudo crear el usuario");
    }

    const metadata = { ...(rep.metadata ?? {}), login_password: data.password };
    const u = await supabaseAdmin
      .from("sales_reps")
      .update({ user_id: userId, email: data.email, metadata } as any)
      .eq("id", rep.id);
    if (u.error) throw new Error(u.error.message);
    return { ok: true, email: data.email };
  });
