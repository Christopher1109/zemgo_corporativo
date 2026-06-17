// Admin > Users layout. Renders <Outlet /> for index + $userId children.
// Access gate: super-admin-only. Non-admins see a 403 message.
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsSuperAdmin } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersLayout,
});

function AdminUsersLayout() {
  const fn = useServerFn(checkIsSuperAdmin);
  const q = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Verificando permisos…</div>;
  }
  if (!q.data?.isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-md border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          Solo administradores pueden gestionar usuarios.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
