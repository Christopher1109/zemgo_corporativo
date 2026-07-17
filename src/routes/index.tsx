import { createFileRoute, redirect } from "@tanstack/react-router";
import { getWebRequest } from "@tanstack/react-start/server";

function isPortalHost(host: string | null | undefined) {
  if (!host) return false;
  return host.toLowerCase().includes("zemgoportal");
}

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    let host: string | null = null;
    if (typeof window !== "undefined") {
      host = window.location.hostname;
    } else {
      try {
        const req = getWebRequest();
        host = req?.headers.get("host") ?? null;
      } catch {
        host = null;
      }
    }
    if (isPortalHost(host)) {
      throw redirect({ to: "/portal" });
    }
    throw redirect({ to: "/dashboard" });
  },
});
