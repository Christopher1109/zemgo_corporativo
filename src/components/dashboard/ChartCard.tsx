import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

export function ChartCard({
  title,
  subtitle,
  children,
  empty,
  loading,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  empty?: ReactNode;
  loading?: boolean;
  action?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="h-[280px]">
        {loading ? (
          <div className="h-full w-full rounded bg-muted/40 animate-pulse" />
        ) : empty ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{empty}</div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
