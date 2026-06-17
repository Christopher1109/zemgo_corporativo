import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus, type LucideIcon, AlertCircle } from "lucide-react";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number | null; // pct change vs previous (e.g. 0.12 = +12%)
  icon?: LucideIcon;
  flag?: "danger" | "warning" | null;
  loading?: boolean;
};

export function KpiCard({ label, value, hint, delta, icon: Icon, flag, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="h-8 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }
  const deltaIcon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const DeltaIcon = deltaIcon;
  const deltaColor = delta == null || delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-emerald-600" : "text-rose-600";
  const flagBorder =
    flag === "danger" ? "border-rose-400/60" : flag === "warning" ? "border-amber-400/60" : "";

  return (
    <Card className={cn("relative overflow-hidden border-2", flagBorder)}>
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: "var(--program-primary)" }}
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--program-primary)" }} />}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-3xl font-bold leading-none">{value}</div>
          {flag === "danger" && <AlertCircle className="h-4 w-4 text-rose-500" />}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {delta != null && (
            <span className={cn("inline-flex items-center gap-1 font-medium", deltaColor)}>
              <DeltaIcon className="h-3 w-3" />
              {(Math.abs(delta) * 100).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
