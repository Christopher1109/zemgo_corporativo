import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsSuperAdmin } from "@/lib/users.functions";
import { LayoutDashboard, Users, FileText, CreditCard, AlertTriangle, BarChart3, Settings, LogOut, ChevronDown, Shield } from "lucide-react";
import { useProgram } from "@/lib/program-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { to: "/clients", label: "Clientes", icon: Users, enabled: true },
  { to: "/policies", label: "Pólizas", icon: FileText, enabled: true },
  { to: "/payments", label: "Pagos", icon: CreditCard, enabled: true },
  { to: "/incidents", label: "Siniestros", icon: AlertTriangle, enabled: true },
  { to: "/reports", label: "Reportes", icon: BarChart3, enabled: true },
  { to: "/settings", label: "Configuración", icon: Settings, enabled: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { programs, activeProgram, setActiveProgramId } = useProgram();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdminFn = useServerFn(checkIsSuperAdmin);
  const isAdminQ = useQuery({
    queryKey: ["is-super-admin"], queryFn: () => isAdminFn(), staleTime: 60_000,
  });

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="h-screen flex bg-background w-full overflow-hidden">
      {/* Sidebar */}
      <aside
        className="w-64 shrink-0 flex flex-col text-white h-screen sticky top-0 overflow-y-auto"
        style={{ backgroundColor: "var(--program-primary)" }}
      >
        <div className="p-4 border-b border-white/10">
          <div className="text-xs uppercase tracking-wider opacity-75">HOPE Consulting</div>
          <div className="font-semibold text-lg mt-0.5">Administración</div>
        </div>

        {/* Program selector */}
        <div className="p-4 border-b border-white/10">
          <div className="text-xs uppercase tracking-wider opacity-75 mb-2">Programa activo</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-white/10 transition border border-white/20"
                style={{ backgroundColor: "var(--program-accent)" }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{activeProgram?.name ?? "Selecciona…"}</div>
                  <div className="text-xs opacity-80 truncate">{activeProgram?.insurance_branch}</div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Cambiar programa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {programs.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setActiveProgramId(p.id)}
                  className="flex items-center gap-2"
                >
                  <span
                    className="h-3 w-3 rounded-full border"
                    style={{ backgroundColor: p.color_primary }}
                  />
                  <span className="flex-1">{p.name}</span>
                  {activeProgram?.id === p.id && <Badge variant="secondary">activo</Badge>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                  active ? "bg-white/20 font-medium" : "hover:bg-white/10",
                  !item.enabled && "opacity-60",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {!item.enabled && (
                  <span className="text-[10px] uppercase opacity-75">Próx.</span>
                )}
              </Link>
            );
          })}
        </nav>

        {isAdminQ.data?.isAdmin && (
          <div className="px-2 pb-2 space-y-1 border-t border-white/10 pt-2">
            <div className="text-[10px] uppercase tracking-wider opacity-60 px-3 pt-1 pb-1">Administración</div>
            <Link to="/admin/users" className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition", pathname.startsWith("/admin/users") ? "bg-white/20 font-medium" : "hover:bg-white/10")}>
              <Shield className="h-4 w-4" /><span>Usuarios</span>
            </Link>
            <Link to="/admin/seed-demo" className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition", pathname.startsWith("/admin/seed-demo") ? "bg-white/20 font-medium" : "hover:bg-white/10")}>
              <Shield className="h-4 w-4" /><span>Seed demo</span>
            </Link>
          </div>
        )}

        <div className="p-3 border-t border-white/10 text-xs opacity-80 truncate">{user?.email}</div>
      </aside>


      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-14 px-6 border-b flex items-center justify-between"
          style={{ borderTopColor: "var(--program-primary)", borderTopWidth: 3, borderTopStyle: "solid" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "var(--program-primary)" }}
            />
            <span className="font-medium">{activeProgram?.name}</span>
            <Badge variant="outline">{activeProgram?.insurance_branch}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Salir
          </Button>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
