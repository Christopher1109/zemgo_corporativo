import { Fragment, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, EyeOff, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listSheetProblemRows,
  retrySheetRow,
  ignoreSheetRow,
} from "@/lib/google-sheets.functions";

function classifyError(msg: string | null | undefined): string {
  if (!msg) return "otro";
  if (msg.toLowerCase().includes("curp")) return "CURP inválida";
  if (msg.toLowerCase().includes("programa")) return "programa desconocido";
  return "otro";
}

export function SheetProblemRowsCard() {
  const qc = useQueryClient();
  const fetchRows = useServerFn(listSheetProblemRows);
  const retry = useServerFn(retrySheetRow);
  const ignore = useServerFn(ignoreSheetRow);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fSheet, setFSheet] = useState<string>("all");
  const [fProgram, setFProgram] = useState<string>("all");
  const [fError, setFError] = useState<string>("all");

  const q = useQuery({ queryKey: ["gs-problems"], queryFn: () => fetchRows() });

  const retryMut = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (res) => {
      const action =
        (res as { result?: { action?: string }; action?: string }).result?.action ??
        (res as { action?: string }).action;
      if (action === "synced_new" || action === "synced_updated")
        toast.success(`Fila re-procesada: ${action}`);
      else if (action === "vanished") toast.info("La fila ya no existe en el sheet");
      else if (action === "unchanged") toast.info("Sin cambios respecto a la última versión");
      else if (action === "failed")
        toast.error("Sigue fallando — revisa los datos en el Sheet");
      else toast(`Resultado: ${action ?? "ok"}`);
      qc.invalidateQueries({ queryKey: ["gs-problems"] });
      qc.invalidateQueries({ queryKey: ["gs-log"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ignoreMut = useMutation({
    mutationFn: (id: string) => ignore({ data: { id } }),
    onSuccess: () => {
      toast.success("Fila marcada como ignorada");
      qc.invalidateQueries({ queryKey: ["gs-problems"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  const sheets = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sheet_id))),
    [rows],
  );
  const programs = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sheet_program))),
    [rows],
  );
  const errorTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => classifyError(r.error_message)))),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (fSheet !== "all" && r.sheet_id !== fSheet) return false;
    if (fProgram !== "all" && r.sheet_program !== fProgram) return false;
    if (fError !== "all" && classifyError(r.error_message) !== fError) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Filas con problemas
              {filtered.length > 0 && (
                <Badge variant="destructive">{filtered.length} requieren atención</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Filas que el sync no pudo procesar. Reintenta cuando HOPE corrija el dato en
              el Sheet, o ignora para capturar manualmente.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["gs-problems"] })}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refrescar
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Select value={fSheet} onValueChange={setFSheet}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sheet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los sheets</SelectItem>
              {sheets.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.slice(0, 10)}…
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fProgram} onValueChange={setFProgram}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Programa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los programas</SelectItem>
              {programs.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fError} onValueChange={setFError}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tipo de error" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los errores</SelectItem>
              {errorTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Sheet</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Folio</TableHead>
              <TableHead className="text-right">Fila</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Ninguna fila requiere atención 🎉
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => {
              const isOpen = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.sheet_id.slice(0, 10)}…
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.sheet_program}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.folio ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.row_number}
                    </TableCell>
                    <TableCell className="text-sm text-destructive max-w-[300px] truncate">
                      {r.error_message ?? "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryMut.isPending}
                        onClick={() => retryMut.mutate(r.id)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Reintentar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ignoreMut.isPending}
                        onClick={() => ignoreMut.mutate(r.id)}
                      >
                        <EyeOff className="h-3 w-3 mr-1" /> Ignorar
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/40">
                        <pre className="text-xs whitespace-pre-wrap font-mono overflow-x-auto">
                          {JSON.stringify(r.raw_data, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
