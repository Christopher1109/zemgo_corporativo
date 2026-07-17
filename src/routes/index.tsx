import { createFileRoute, redirect } from "@tanstack/react-router";

function isPortalHost(host: string | null | undefined) {
  return !!host && host.toLowerCase().includes("zemgoportal");
}

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    let host: string | null = null;
    if (typeof window !== "undefined") {
      host = window.location.hostname;
    } else {
      // SSR: read from request headers via globalThis (set by TanStack Start)
      const req = (globalThis as any).__TSR_REQUEST__ as Request | undefined;
      host = req?.headers.get("host") ?? null;
    }
    if (isPortalHost(host)) {
      throw redirect({ to: "/portal" });
    }
    throw redirect({ to: "/dashboard" });
  },
});
