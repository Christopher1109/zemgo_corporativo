import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPoliciesByState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ program_id: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("get_policies_by_state", {
      _program_id: (data.program_id ?? null) as any,
    });
    if (error) throw new Error(error.message);
    return res ?? [];
  });

// Detalle expandido para el reporte geográfico.
// Filtra por match difuso de estado en clients.state para acomodar variantes
// ("Nuevo León", "NUEVO LEON", "N.L.", "N. L.", etc.).
export const getStateDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      state_names: z.array(z.string()).min(1),
      program_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const names = data.state_names.map((n) => n.trim()).filter(Boolean);
    const orFilter = names
      .map((n) => `state.ilike.%${n.replace(/[%,]/g, "")}%`)
      .join(",");

    // Pólizas del estado con toda la info que necesitamos.
    let polQ = sb
      .from("policies")
      .select(
        "id, folio, status, start_date, end_date, premium, sum_insured, program_id, " +
          "programs(code, name, color_primary), " +
          "clients!inner(id, first_name, last_name, state)"
      )
      .or(orFilter, { referencedTable: "clients" })
      .limit(500);
    if (data.program_id) polQ = polQ.eq("program_id", data.program_id);
    const pol = await polQ;
    if (pol.error) throw new Error(pol.error.message);

    const rows = (pol.data ?? []) as any[];
    const today = new Date();
    const in60 = new Date(Date.now() + 60 * 86400000);

    // Distribución por programa.
    const byProgram = new Map<string, { code: string; name: string; color: string; count: number }>();
    let sumInsured = 0;
    let sumPremium = 0;
    for (const r of rows) {
      const p = r.programs;
      if (p) {
        const cur = byProgram.get(p.code) ?? { code: p.code, name: p.name, color: p.color_primary, count: 0 };
        cur.count += 1;
        byProgram.set(p.code, cur);
      }
      sumInsured += Number(r.sum_insured ?? 0);
      sumPremium += Number(r.premium ?? 0);
    }

    // Próximas renovaciones (<= 60 días, activas).
    const renewals = rows
      .filter((r) => {
        if (r.status !== "active" || !r.end_date) return false;
        const d = new Date(r.end_date);
        return d >= today && d <= in60;
      })
      .sort((a, b) => (a.end_date < b.end_date ? -1 : 1))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        folio: r.folio,
        end_date: r.end_date,
        client: `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim(),
        program: r.programs?.name,
      }));

    // Clientes únicos.
    const clientsMap = new Map<string, any>();
    for (const r of rows) {
      const c = r.clients;
      if (!c || clientsMap.has(c.id)) continue;
      clientsMap.set(c.id, {
        id: c.id,
        name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        program: r.programs?.name,
        status: r.status,
        folio: r.folio,
      });
    }
    const clients = Array.from(clientsMap.values()).slice(0, 20);

    return {
      totals: {
        policies: rows.length,
        sum_insured: sumInsured,
        premium_year: sumPremium,
        clients: clientsMap.size,
      },
      by_program: Array.from(byProgram.values()).sort((a, b) => b.count - a.count),
      renewals,
      clients,
    };
  });
