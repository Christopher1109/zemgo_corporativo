import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";
export const Route = createFileRoute("/_authenticated/incidents")({
  component: () => <Placeholder title="Siniestros" />,
});
