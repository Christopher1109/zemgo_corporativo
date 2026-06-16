import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pendiente",  cls: "bg-muted text-muted-foreground border-muted-foreground/20" },
  overdue:   { label: "Vencido",    cls: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200" },
  paid:      { label: "Pagado",     cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200" },
  failed:    { label: "Fallido",    cls: "bg-red-200 text-red-900 border-red-400 dark:bg-red-900 dark:text-red-100" },
  refunded:  { label: "Reembolsado",cls: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200" },
  cancelled: { label: "Cancelado",  cls: "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300" },
  processing:{ label: "Procesando", cls: "bg-amber-100 text-amber-800 border-amber-300" },
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const cfg = MAP[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={cn("font-medium", cfg.cls)}>{cfg.label}</Badge>;
}
