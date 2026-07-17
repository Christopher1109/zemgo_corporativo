import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  ssr: false,
  component: RootRedirect,
});

function RootRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("zemgoportal")) {
      navigate({ to: "/portal", replace: true });
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);
  return null;
}
