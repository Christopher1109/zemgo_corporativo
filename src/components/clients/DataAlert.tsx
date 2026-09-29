import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATA_ALERT_FIELD_LABELS, getDataAlerts } from "@/lib/data-alerts";

/** Icono amarillo pequeño con el detalle en el tooltip nativo. */
export function DataAlertIcon({ metadata, field, className }: { metadata: unknown; field?: string; className?: string }) {
  const alerts = getDataAlerts(metadata, field);
  if (alerts.length === 0) return null;
  return (
    <span
      className={cn("inline-flex items-center text-amber-600", className)}
      title={alerts.map((a) => a.message).join("\n")}
      aria-label="Dato posiblemente equivocado"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
    </span>
  );
}

/** Aviso amarillo con la lista de datos a verificar. */
export function DataAlertBanner({ metadata, className }: { metadata: unknown; className?: string }) {
  const alerts = getDataAlerts(metadata);
  if (alerts.length === 0) return null;
  return (
    <div className={cn("rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900", className)}>
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        Datos posiblemente equivocados — verificar con el asegurado
      </div>
      <ul className="mt-1 ml-6 list-disc space-y-0.5">
        {alerts.map((a, i) => (
          <li key={i}>
            <span className="font-medium">{DATA_ALERT_FIELD_LABELS[a.field] ?? a.field}:</span> {a.message}
            {a.source && <span className="text-amber-700/80"> ({a.source})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
