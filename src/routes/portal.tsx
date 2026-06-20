import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/portal")({
  ssr: false,
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Outlet />
      <Toaster richColors position="top-center" />
    </div>
  );
}
