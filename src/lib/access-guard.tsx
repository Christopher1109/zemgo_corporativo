import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/lib/program-context";
import {
  useMyAccess,
  useAuthLevel,
  modulesForProgram,
  canAccessModule,
  type ModuleKey,
} from "@/lib/use-my-access";

/** Prefijo de ruta → módulo requerido en el PROGRAMA ACTIVO. */
const ROUTE_MODULES: Array<{ prefix: string; module: ModuleKey }> = [
  { prefix: "/clients", module: "clients" },
  { prefix: "/policies", module: "policies" },
  { prefix: "/payments", module: "payments" },
  { prefix: "/finance", module: "finance" },
  { prefix: "/incidents", module: "incidents" },
  { prefix: "/hospitals", module: "hospitals" },
  { prefix: "/alerts", module: "alerts" },
  { prefix: "/sales-reps", module: "sales_reps" },
  { prefix: "/reports", module: "reports" },
];

function Denied({ reason }: { reason: string }) {
  return (
    <Card className="max-w-lg mx-auto mt-10">
      <CardContent className="p-8 text-center space-y-3">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard">Volver al dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Gate de sección. Bloquea la vista aunque se entre por URL directa.
 * El backend (RLS) también lo impide: esto solo evita pantallas rotas.
 */
export function RouteAccessGuard({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeProgram } = useProgram();
  const { data: access, isLoading: loadingAccess } = useMyAccess();
  const { data: level, isLoading: loadingLevel } = useAuthLevel();

  if (loadingAccess || loadingLevel) {
    return <div className="h-40 rounded-md bg-muted/40 animate-pulse" />;
  }

  const isSuperAdmin = !!level?.isSuperAdmin;

  if (pathname.startsWith("/admin") && !isSuperAdmin) {
    return <Denied reason="Las integraciones están reservadas al Superadministrador." />;
  }

  if (pathname.startsWith("/settings") && !level?.canManageUsers) {
    return <Denied reason="La configuración está reservada a administradores." />;
  }

  if (isSuperAdmin) return <>{children}</>;

  const entry = ROUTE_MODULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  if (!entry) return <>{children}</>;

  const mods = modulesForProgram(access, activeProgram?.id);
  if (!canAccessModule(mods, entry.module)) {
    return (
      <Denied
        reason={`No tienes permiso para esta sección en el programa ${activeProgram?.code ?? "activo"}.`}
      />
    );
  }

  return <>{children}</>;
}
