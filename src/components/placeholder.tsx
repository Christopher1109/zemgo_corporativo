import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <CardHeader><CardTitle>Próximamente</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta sección estará disponible en una próxima iteración.
        </CardContent>
      </Card>
    </div>
  );
}
