import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, FileText, CreditCard, AlertTriangle, BarChart3, Settings, LogOut, ChevronDown, Bell, Wallet, Plug, Hospital, Briefcase, MessageCircle } from "lucide-react";
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

import { ProgramLogo } from "@/components/program-logo";
import { SidebarNotifications } from "@/components/sidebar-notifications";
import { AccountMenu } from "@/components/account-menu";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccess, useAuthLevel, modulesForProgram, canAccessModule, type ModuleKey } from "@/lib/use-my-access";
import { RouteAccessGuard } from "@/lib/access-guard";

type NavItem = {
  to: string;
  label: string;
  icon: any;
  module: ModuleKey | null;
  requires?: "manage_users";
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: null },
  { to: "/clients", label: "Clientes", icon: Users, module: "clients" },
  { to: "/policies", label: "Certificados", icon: FileText, module: "policies" },
  { to: "/payments", label: "Pagos", icon: CreditCard, module: "payments" },
  { to: "/finance", label: "Finanzas", icon: Wallet, module: "finance" },
  { to: "/incidents", label: "Siniestros", icon: AlertTriangle, module: "incidents" },
  { to: "/hospitals", label: "Hospitales", icon: Hospital, module: "hospitals" },
  { to: "/alerts", label: "Alertas y renovaciones", icon: Bell, module: "alerts" },
  { to: "/messages", label: "Mensajes", icon: MessageCircle, module: "messages" },
  { to: "/sales-reps", label: "Vendedores", icon: Briefcase, module: "sales_reps" },
  { to: "/reports", label: "Reportes", icon: BarChart3, module: "reports" },
  { to: "/settings", label: "Configuración", icon: Settings, module: null, requires: "manage_users" },
];


const ADMIN_NAV = [
  { to: "/admin/integrations/google-sheets", label: "Google Sheets", icon: Plug },
] as const;

export function useIsSuperAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-super-admin", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_super_admin", { _user_id: user!.id });
      if (error) return false;
      return !!data;
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const { programs, activeProgram, setActiveProgramId } = useProgram();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: level } = useAuthLevel();
  const isSuperAdmin = !!level?.isSuperAdmin;
  const { data: myAccess } = useMyAccess();
  // Permisos del PROGRAMA ACTIVO (no la unión de todos)
  const programModules = modulesForProgram(myAccess, activeProgram?.id);
  const visibleNav = NAV.filter((n) => {
    if (n.requires === "manage_users") return !!level?.canManageUsers;
    if (isSuperAdmin) return true;
    if (n.module === null) return true;
    return canAccessModule(programModules, n.module);
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
          <div className="rounded-md bg-white/95 px-3 py-4 flex items-center justify-center h-24">
            {activeProgram?.code ? (
              <ProgramLogo
                code={activeProgram.code}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-xs text-slate-500">Sin programa</span>
            )}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-widest opacity-70 text-center">
            Administración
          </div>
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
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                  active ? "bg-white/20 font-medium" : "hover:bg-white/10",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}


          {isSuperAdmin && (
            <div className="pt-4">
              <div className="px-3 pb-1 text-[10px] uppercase tracking-widest opacity-60">
                Integraciones
              </div>
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                      active ? "bg-white/20 font-medium" : "hover:bg-white/10",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>




        <div className="p-3 border-t border-white/10 text-xs opacity-80 truncate">{user?.email}</div>
      </aside>


      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header
          className="h-14 px-6 border-b flex items-center justify-between shrink-0"
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
          <div className="flex items-center gap-2">
            <SidebarNotifications />
            <AccountMenu />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" /> Salir
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">
          <RouteAccessGuard>{children}</RouteAccessGuard>
        </main>
      </div>
    </div>
  );
}
