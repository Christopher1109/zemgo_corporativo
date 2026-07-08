// Contratantes: entidad reutilizable con datos de contacto.
// Buscador, creación y validaciones (bloqueo contra contacto del propio
// usuario, advertencia si el contacto ya pertenece a otro contratante).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const contactRegex = {
  digits: (v: string) => v.replace(/\D+/g, ""),
  email: (v: string) => v.trim().toLowerCase(),
};

export const searchContractors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ term: z.string().min(0).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const term = data.term.trim();
    if (term.length < 2) return [];
    const like = `%${term}%`;
    const { data: rows, error } = await context.supabase
      .from("contractors" as any)
      .select("id, full_name, curp, phone, email, city, state")
      .or(`full_name.ilike.${like},curp.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .order("full_name")
      .limit(10);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

const contractorInput = z.object({
  full_name: z.string().trim().min(2).max(200),
  curp: z.string().trim().max(30).optional().nullable(),
  rfc: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  phone_alt: z.string().trim().max(40).optional().nullable(),
  street: z.string().trim().max(200).optional().nullable(),
  number: z.string().trim().max(30).optional().nullable(),
  colonia: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  zip: z.string().trim().max(20).optional().nullable(),
  linked_client_id: z.string().uuid().optional().nullable(),
  confirm_duplicate: z.boolean().optional().default(false),
});

export const createContractor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => contractorInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const phoneNorm = data.phone ? contactRegex.digits(data.phone) : "";
    const emailNorm = data.email ? contactRegex.email(data.email) : "";

    // 1) Bloqueo contra contacto del propio usuario en sesión.
    if (phoneNorm || emailNorm) {
      const { data: meRow } = await supabase
        .from("profiles" as any)
        .select("phone")
        .eq("id", userId)
        .maybeSingle();
      const me = (meRow as { phone?: string | null } | null) ?? null;
      const myPhone = me?.phone ? contactRegex.digits(me.phone) : "";
      const myEmail = (context.claims as any)?.email
        ? contactRegex.email(String((context.claims as any).email))
        : "";
      if ((phoneNorm && phoneNorm === myPhone) || (emailNorm && emailNorm === myEmail)) {
        throw new Error("propio_contacto");
      }
    }

    // 2) Advertencia (no bloqueante) por duplicado con otro contratante.
    if (!data.confirm_duplicate && (phoneNorm || emailNorm)) {
      const conds: string[] = [];
      if (phoneNorm) conds.push(`phone.ilike.%${phoneNorm.slice(-10)}%`);
      if (emailNorm) conds.push(`email.ilike.${emailNorm}`);
      const { data: dup } = await supabase
        .from("contractors" as any)
        .select("id, full_name, phone, email")
        .or(conds.join(","))
        .limit(1);
      if (dup && dup.length > 0) {
        return { duplicate: dup[0], created: null } as const;
      }
    }

    const { data: row, error } = await supabase
      .from("contractors" as any)
      .insert({
        full_name: data.full_name,
        curp: data.curp || null,
        rfc: data.rfc || null,
        email: emailNorm || null,
        phone: data.phone || null,
        phone_alt: data.phone_alt || null,
        street: data.street || null,
        number: data.number || null,
        colonia: data.colonia || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        linked_client_id: data.linked_client_id || null,
        created_by: userId,
      })
      .select("id, full_name, curp, phone, email, city, state")
      .single();
    if (error) throw new Error(error.message);
    return { duplicate: null, created: row } as const;
  });

export const createContractorFromClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ client_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c, error } = await supabase
      .from("clients")
      .select("id, first_name, last_name, curp, rfc, email, phone, phone_alt, street, number, colonia, city, state, zip")
      .eq("id", data.client_id)
      .single();
    if (error) throw new Error(error.message);

    // Reusar si ya hay uno enlazado a este cliente
    const { data: existing } = await supabase
      .from("contractors" as any)
      .select("id, full_name, curp, phone, email, city, state")
      .eq("linked_client_id", data.client_id)
      .limit(1);
    if (existing && existing.length > 0) return existing[0];

    const full_name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Contratante";

    const { data: row, error: insErr } = await supabase
      .from("contractors" as any)
      .insert({
        full_name,
        curp: c.curp,
        rfc: c.rfc,
        email: c.email,
        phone: c.phone,
        phone_alt: c.phone_alt,
        street: c.street,
        number: c.number,
        colonia: c.colonia,
        city: c.city,
        state: c.state,
        zip: c.zip,
        linked_client_id: c.id,
        created_by: userId,
      })
      .select("id, full_name, curp, phone, email, city, state")
      .single();
    if (insErr) throw new Error(insErr.message);
    return row;
  });
