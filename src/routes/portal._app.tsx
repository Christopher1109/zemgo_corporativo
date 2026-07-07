import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { portalMe, portalLogout } from "@/lib/portal/portal.functions";
import { clearPortalToken } from "@/lib/portal/portal-token";
import { Home, FileText, CreditCard, AlertTriangle, User, LogOut } from "lucide-react";
import { HopeLogo } from "@/components/hope-logo";

export const Route = createFileRoute("/portal/_app")({
  component: PortalAppLayout,
});

type Client = { id: string; first_name: string; last_name: string };
const PortalCtxKey = "__portal_client__";

export function usePortalClient(): Client | null {
  const [c, setC] = useState<Client | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(PortalCtxKey);
    return raw ? JSON.parse(raw) : null;
  });
  useEffect(() => {
    function onStorage() {
      const raw = sessionStorage.getItem(PortalCtxKey);
      setC(raw ? JSON.parse(raw) : null);
    }
    window.addEventListener("portal-client-updated", onStorage);
    return () => window.removeEventListener("portal-client-updated", onStorage);
  }, []);
  return c;
}

function PortalAppLayout() {
  const navigate = useNavigate();
  const me = useServerFn(portalMe);
  const logout = useServerFn(portalLogout);
  const [ready, setReady] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    (async () => {
      try {
        const r: any = await me();
        if (!r?.authenticated) {
          navigate({ to: "/portal" });
          return;
        }
        setClient(r.client);
        sessionStorage.setItem(PortalCtxKey, JSON.stringify(r.client));
        window.dispatchEvent(new Event("portal-client-updated"));
        setReady(true);
      } catch {
        navigate({ to: "/portal" });
      }
    })();
  }, [me, navigate]);

  async function onLogout() {
    await logout();
    sessionStorage.removeItem(PortalCtxKey);
    navigate({ to: "/portal" });
  }

  if (!ready || !client) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Cargando…</div>;
  }

  const navItems = [
    { to: "/portal/dashboard", label: "Inicio", icon: Home },
    { to: "/portal/policies", label: "Certificados", icon: FileText },
    { to: "/portal/payments", label: "Pagos", icon: CreditCard },
    { to: "/portal/incidents", label: "Siniestros", icon: AlertTriangle },
    { to: "/portal/profile", label: "Mis Datos", icon: User },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/portal/dashboard" className="flex items-center gap-3">
            <HopeLogo variant="light" className="h-8 w-auto" />
            <span className="hidden sm:inline text-xs uppercase tracking-widest text-slate-300 border-l border-slate-700 pl-3">
              Portal del Asegurado
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`rounded-md px-3 py-2 text-sm transition ${
                    active
                      ? "bg-yellow-400 text-slate-900 font-medium"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
            <button
              onClick={onLogout}
              className="ml-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
              title="Cerrar sesión"
            >
              <LogOut className="inline h-4 w-4" />
            </button>
          </nav>
          <button
            onClick={onLogout}
            className="md:hidden rounded-md p-2 text-slate-300 hover:bg-white/10"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden">
        {navItems.map((n) => {
          const active = pathname === n.to;
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`flex flex-col items-center gap-1 py-2 text-xs ${
                active ? "text-slate-900 font-medium" : "text-slate-500"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-yellow-500" : ""}`} />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
