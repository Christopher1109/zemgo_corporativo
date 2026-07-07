import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { getAlertsOverview } from "@/lib/alerts.functions";
import { useProgram } from "@/lib/program-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

export function SidebarNotifications() {
  const { activeProgram } = useProgram();
  const fn = useServerFn(getAlertsOverview);
  const { data } = useQuery({
    queryKey: ["alerts-overview", activeProgram?.id ?? null],
    queryFn: () => fn({ data: { program_id: activeProgram?.id ?? null } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const upcoming = (data?.upcoming ?? []) as any[];
  const renewals = (data?.renewals ?? []) as any[];
  const suspended = (data?.suspended ?? []) as any[];
  const total = upcoming.length + renewals.length + suspended.length;
  const items = [
    ...renewals.slice(0, 5).map((r) => ({
      id: `r-${r.id}`,
      type: "Renovación",
      title: `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim() || r.folio,
      date: r.end_date,
      href: `/policies/${r.id}` as const,
    })),
    ...upcoming.slice(0, 5).map((p) => ({
      id: `p-${p.id}`,
      type: p.status === "overdue" ? "Pago vencido" : "Pago próximo",
      title: `${p.policies?.clients?.first_name ?? ""} ${p.policies?.clients?.last_name ?? ""}`.trim() || p.policies?.folio,
      date: p.due_date,
      href: `/payments/${p.id}` as const,
    })),
    ...suspended.slice(0, 3).map((s) => ({
      id: `s-${s.id}`,
      type: "Suspendida",
      title: `${s.clients?.first_name ?? ""} ${s.clients?.last_name ?? ""}`.trim() || s.folio,
      date: s.end_date,
      href: `/policies/${s.id}` as const,
    })),
  ].slice(0, 10);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center rounded-md p-2 hover:bg-white/10 transition"
          aria-label="Notificaciones"
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alertas activas</span>
          <span className="text-xs text-muted-foreground font-normal">{total} en total</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No hay alertas pendientes.
          </div>
        ) : (
          <ul className="py-1">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  to={it.href}
                  className="flex items-start gap-2 px-3 py-2 text-xs hover:bg-muted transition"
                >
                  <span className="mt-0.5 inline-flex shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    {it.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{it.title}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtDate(it.date)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <DropdownMenuSeparator />
        <Link
          to="/alerts"
          className="block px-3 py-2 text-center text-xs font-medium text-primary hover:bg-muted"
        >
          Ver todas las alertas y renovaciones
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
