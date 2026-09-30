import { Card, CardContent } from "@/components/ui/card";
import { useProgram } from "@/lib/program-context";

/**
 * Bloquea el detalle de un registro que pertenece a otro programa distinto al activo.
 * Regla del sistema: cada programa se ve por separado (ABC, FutCare, Manos con Valor).
 */
export function useProgramMismatch(recordProgramId: string | null | undefined) {
  const { activeProgram, programs } = useProgram();
  if (!activeProgram || !recordProgramId || recordProgramId === activeProgram.id) return null;
  const other = programs.find((p) => p.id === recordProgramId);
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        Este registro pertenece al programa <b>{other?.name ?? "otro programa"}</b>. Cambia al programa{" "}
        {other?.name ?? "correspondiente"} en el menú lateral para verlo.
      </CardContent>
    </Card>
  );
}
