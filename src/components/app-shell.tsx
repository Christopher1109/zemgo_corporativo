import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { FileCheck2, RefreshCw, LayoutDashboard, Menu, Smartphone, MoreHorizontal, Users, FileText, CreditCard, AlertTriangle, BarChart3, Settings, LogOut, ChevronDown, Bell, Wallet, Hospital, Briefcase, MessageCircle, Building2 } from "lucide-react";
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
import { groupLabels } from "@/lib/group-labels";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { InstallShortcutDialog } from "@/components/install-shortcut";

import { ProgramLogo } from "@/components/program-logo";
import { SidebarNotifications } from "@/components/sidebar-notifications";
import { AccountMenu } from "@/components/account-menu";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccess, useAuthLevel, modulesForProgram, canAccessModule, type ModuleKey } from "@/lib/use-my-access";
import { RouteAccessGuard } from "@/lib/access-guard";
import { useIsSalesRepOnly } from "@/lib/use-is-sales-rep-only";

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
  { to: "/companies", label: "Empresas", icon: Building2, module: "clients" },
  { to: "/policies", label: "Certificados", icon: FileText, module: "policies" },
  { to: "/certificates", label: "Altas, bajas y certificados", icon: FileCheck2, module: "policies" },
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
  const { data: isSalesRepOnly } = useIsSalesRepOnly();
  // Permisos del PROGRAMA ACTIVO (no la unión de todos)
  const programModules = modulesForProgram(myAccess, activeProgram?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  // Cierra el menú lateral del celular al cambiar de pantalla
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  const visibleNav = isSalesRepOnly
    ? ([
        { to: "/mi-cartera", label: "Resumen", icon: LayoutDashboard, module: null },
        { to: "/mi-cartera/clientes", label: "Mis clientes", icon: Users, module: null },
        { to: "/mi-cartera/renovaciones", label: "Renovaciones", icon: RefreshCw, module: null },
        { to: "/mi-cartera/pagos", label: "Pagos", icon: CreditCard, module: null },
        { to: "/mi-cartera/comisiones", label: "Comisiones", icon: Wallet, module: null },
      ] as NavItem[])
    : NAV.filter((n) => {
        if (n.requires === "manage_users") return !!level?.canManageUsers;
        if (isSuperAdmin) return true;
        if (n.module === null) return true;
        return canAccessModule(programModules, n.module);
      });




  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) =>
    to === "/mi-cartera"
      ? pathname === "/mi-cartera" || pathname === "/mi-cartera/"
      : pathname === to || pathname.startsWith(to + "/");

  const labelFor = (item: NavItem) =>
    item.to === "/companies" ? groupLabels(activeProgram?.code).plural : item.label;

  // Barra inferior del celular: 4 accesos principales + "Más" (abre el menú completo)
  const BOTTOM_PREFERRED = ["/dashboard", "/clients", "/payments", "/alerts", "/policies", "/companies"];
  const bottomNav = isSalesRepOnly
    ? visibleNav.slice(0, 4)
    : BOTTOM_PREFERRED.map((to) => visibleNav.find((n) => n.to === to))
        .filter((n): n is NavItem => !!n)
        .slice(0, 4);

  const SHORT_LABELS: Record<string, string> = {
    "/dashboard": "Inicio",
    "/alerts": "Alertas",
    "/mi-cartera": "Resumen",
    "/mi-cartera/clientes": "Clientes",
  };

  const sidebarBg = {
    background:
      "linear-gradient(180deg, var(--program-primary, #0f2a4a) 0%, color-mix(in oklab, var(--program-primary, #0f2a4a) 80%, black) 100%)",
  };

  const sidebarContent = (
    <>
      <div className="px-4 pt-4 pb-3">
        <div className="rounded-xl bg-white px-3 py-3 flex items-center justify-center h-16 shadow-sm">
          {activeProgram?.code ? (
            <ProgramLogo code={activeProgram.code} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-500">Sin programa</span>
          )}
        </div>
        <div className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/60 text-center">
          {isSalesRepOnly ? "Portal de vendedores" : "Administración"}
        </div>
      </div>

      {/* Program selector */}
      {(!isSalesRepOnly || programs.length > 1) && (
        <div className="px-4 pb-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition bg-white/10 hover:bg-white/15 ring-1 ring-white/15">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{activeProgram?.name ?? "Selecciona…"}</div>
                  <div className="text-[11px] text-white/60 truncate">{activeProgram?.insurance_branch}</div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Cambiar programa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {programs.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setActiveProgramId(p.id)} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: p.color_primary }} />
                  <span className="flex-1">{p.name}</span>
                  {activeProgram?.id === p.id && <Badge variant="secondary">activo</Badge>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 pt-1 pb-3 space-y-0.5">
        <div className="px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Menú</div>
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 lg:py-2 text-sm lg:text-[13px] transition-colors",
                active ? "bg-white font-semibold shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white",
              )}
              style={active ? { color: "var(--program-primary, #0f2a4a)" } : undefined}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "" : "text-white/60 group-hover:text-white")} />
              <span className="flex-1 truncate">{labelFor(item)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-2">
        <button
          onClick={() => setInstallOpen(true)}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 lg:py-2 text-sm lg:text-[13px] text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Smartphone className="h-4 w-4 shrink-0 text-white/60" />
          <span className="flex-1 text-left truncate">Acceso directo celular</span>
        </button>
        <button
          onClick={handleSignOut}
          className="lg:hidden w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0 text-white/60" />
          <span className="flex-1 text-left truncate">Cerrar sesión</span>
        </button>
      </div>

      <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-lg bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold uppercase">
          {(user?.email ?? "?").slice(0, 2)}
        </span>
        <span className="truncate text-xs text-white/80">{user?.email}</span>
      </div>
    </>
  );

  return (
    <div className="h-dvh flex bg-background w-full overflow-hidden">
      {/* Barra lateral (computadora) */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col text-white h-dvh sticky top-0 overflow-y-auto" style={sidebarBg}>
        {sidebarContent}
      </aside>

      {/* Menú lateral deslizable (celular / tablet) */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="w-[85vw] max-w-xs p-0 border-0 text-white flex flex-col overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] [&>button:first-child]:hidden"
          style={sidebarBg}
        >
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SheetDescription className="sr-only">Navegación del sistema ZEMGO</SheetDescription>
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-dvh overflow-hidden">
        <header className="shrink-0 border-b bg-background/80 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="h-14 px-3 lg:px-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <button
                onClick={() => setMenuOpen(true)}
                className="lg:hidden -ml-1 p-2 rounded-md hover:bg-muted"
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: "var(--program-primary, #0f2a4a)" }}
              />
              <span className="font-medium truncate">{activeProgram?.name}</span>
              {isSalesRepOnly ? (
                <Badge variant="outline" className="hidden sm:inline-flex">Vendedor</Badge>
              ) : (
                activeProgram?.insurance_branch && (
                  <Badge variant="outline" className="hidden sm:inline-flex">{activeProgram.insurance_branch}</Badge>
                )
              )}
            </div>
            <div className="flex items-center gap-1 lg:gap-2 shrink-0">
              {!isSalesRepOnly && <SidebarNotifications />}
              <AccountMenu />
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="hidden lg:inline-flex">
                <LogOut className="h-4 w-4 mr-2" /> Salir
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <RouteAccessGuard>{children}</RouteAccessGuard>
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-md border-t pb-[env(safe-area-inset-bottom)]">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${bottomNav.length + 1}, minmax(0, 1fr))` }}>
          {bottomNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-medium transition-colors",
                  active ? "" : "text-muted-foreground",
                )}
                style={active ? { color: "var(--program-primary, #0f2a4a)" } : undefined}
              >
                <span
                  className="flex items-center justify-center h-7 w-12 rounded-full transition-colors"
                  style={active ? { backgroundColor: "color-mix(in oklab, var(--program-primary, #0f2a4a) 12%, transparent)" } : undefined}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate px-1">{SHORT_LABELS[item.to] ?? labelFor(item)}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-medium text-muted-foreground"
          >
            <span className="flex items-center justify-center h-7 w-12 rounded-full">
              <MoreHorizontal className="h-5 w-5" />
            </span>
            Más
          </button>
        </div>
      </nav>

      <InstallShortcutDialog open={installOpen} onOpenChange={setInstallOpen} />
    </div>
  );
}
