import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/placeholder";
export const Route = createFileRoute("/_authenticated/policies")({
  component: () => <Placeholder title="Pólizas" />,
});
