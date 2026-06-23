import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Copy,
  Loader2,
  RefreshCcw,
  Play,
  ShieldAlert,
} from "lucide-react";
import { AppShell, useIsSuperAdmin } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getGoogleSheetsConfig,
  saveGoogleSheetsCredentials,
  setGoogleSheetsEnabled,
  testGoogleSheetsConnection,
  listSheetSyncLog,
  runGoogleSheetsSyncNow,
} from "@/lib/google-sheets.functions";

export const Route = createFileRoute("/_authenticated/admin/integrations/google-sheets")({
  component: GoogleSheetsAdminPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" /> No se pudo cargar
              </CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => {
                  reset();
                  router.invalidate();
                }}
              >
                Reintentar
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  },
  notFoundComponent: () => <div>404</div>,
});

function GoogleSheetsAdminPage() {
  const { data: isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const qc = useQueryClient();
  if (roleLoading) {
    return (
      <AppShell>
        <div className="p-8 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando permisos…
        </div>
      </AppShell>
    );
  }
  if (!isSuperAdmin) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" /> Acceso restringido
              </CardTitle>
              <CardDescription>
                Esta pantalla solo está disponible para super administradores.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }
  const fetchConfig = useServerFn(getGoogleSheetsConfig);
  const fetchLog = useServerFn(listSheetSyncLog);
  const saveCreds = useServerFn(saveGoogleSheetsCredentials);
  const testConn = useServerFn(testGoogleSheetsConnection);
  const toggleEnabled = useServerFn(setGoogleSheetsEnabled);
  const syncNow = useServerFn(runGoogleSheetsSyncNow);

  const cfgQ = useQuery({ queryKey: ["gs-config"], queryFn: () => fetchConfig() });
  const logQ = useQuery({ queryKey: ["gs-log"], queryFn: () => fetchLog() });

  const [jsonInput, setJsonInput] = useState("");
  const [probe, setProbe] = useState<Awaited<ReturnType<typeof testConn>> | null>(null);

  const saveMut = useMutation({
    mutationFn: (json: string) => saveCreds({ data: { service_account_json: json } }),
    onSuccess: (res) => {
      toast.success(`Credenciales guardadas (${res.client_email})`);
      setJsonInput("");
      qc.invalidateQueries({ queryKey: ["gs-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => testConn(),
    onSuccess: (res) => {
      setProbe(res);
      const okCount = res.results.filter((r) => r.ok && r.tab_found).length;
      toast(`Probados ${res.results.length} sheets — ${okCount} OK`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => toggleEnabled({ data: { enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gs-config"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: () => syncNow({ data: {} }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Sincronización ejecutada");
        qc.invalidateQueries({ queryKey: ["gs-log"] });
      } else {
        toast.error(res.error ?? "Sincronización falló");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (cfgQ.isLoading) {
    return (
      <AppShell>
        <div className="p-8 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      </AppShell>
    );
  }
  if (cfgQ.error) {
    return (
      <AppShell>
        <div className="p-8 text-destructive">{(cfgQ.error as Error).message}</div>
      </AppShell>
    );
  }

  const cfg = cfgQ.data!;
  const credsMeta = (cfg.credentials ?? {}) as {
    configured?: boolean;
    client_email?: string;
  };
  const credConfigured = !!credsMeta.configured;
  const clientEmail = credsMeta.client_email;

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Integración Google Sheets</h1>
          <p className="text-muted-foreground text-sm">
            Sincroniza los 3 sheets de HOPE Consulting con el CRM. El CRM solo lee — AutoCrat sigue
            generando los certificados.
          </p>
        </div>

        {/* A — Credenciales */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Credenciales</CardTitle>
                <CardDescription>
                  Service Account de Google Cloud con acceso de lectura a los sheets.
                </CardDescription>
              </div>
              {credConfigured ? (
                <Badge className="bg-emerald-600">Configurado</Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500 text-amber-700">
                  Sin configurar
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {credConfigured && clientEmail && (
              <div className="space-y-2">
                <Label>Email de la cuenta de servicio</Label>
                <div className="flex gap-2">
                  <Input readOnly value={clientEmail} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(clientEmail);
                      toast.success("Email copiado");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Comparte cada Google Sheet con este email en modo <b>Lector</b>.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sa-json">
                {credConfigured ? "Actualizar JSON del Service Account" : "Pega el JSON del Service Account"}
              </Label>
              <Textarea
                id="sa-json"
                rows={10}
                placeholder='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----..."}'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button
                  disabled={!jsonInput.trim() || saveMut.isPending}
                  onClick={() => saveMut.mutate(jsonInput)}
                >
                  {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar credenciales
                </Button>
                <Button
                  variant="outline"
                  disabled={!credConfigured || testMut.isPending}
                  onClick={() => testMut.mutate()}
                >
                  {testMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Probar conexión
                </Button>
              </div>
            </div>

            {probe && (
              <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                <div className="text-sm font-medium">Resultado de la prueba</div>
                {probe.results.map((r) => (
                  <div key={r.sheet_id} className="flex items-center gap-2 text-sm">
                    {r.ok && r.tab_found ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-semibold w-20">{r.program}</span>
                    <span className="text-xs font-mono opacity-60 truncate flex-1">
                      {r.sheet_id}
                    </span>
                    <span className="text-xs">
                      {r.ok && r.tab_found
                        ? `OK — "${r.title}" · ${r.rows} filas`
                        : r.ok && !r.tab_found
                          ? `Sheet accesible pero falta pestaña "REGISTRO PARA CERTIFICADO"`
                          : r.error_code === "forbidden"
                            ? "Permiso denegado — comparte con el email"
                            : r.error_code === "not_found"
                              ? "Sheet no encontrado"
                              : (r.error ?? "Error")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* B — Sheets configurados */}
        <Card>
          <CardHeader>
            <CardTitle>Sheets configurados</CardTitle>
            <CardDescription>Un sheet por programa.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Programa</TableHead>
                  <TableHead>Sheet ID</TableHead>
                  <TableHead>Pestaña</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cfg.sheets.map((s) => (
                  <TableRow key={s.sheet_id}>
                    <TableCell>
                      <Badge variant="outline">{s.program}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.sheet_id}</TableCell>
                    <TableCell className="text-xs">{s.tab}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `https://docs.google.com/spreadsheets/d/${s.sheet_id}/edit`,
                            "_blank",
                          )
                        }
                      >
                        Abrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* E — Control */}
        <Card>
          <CardHeader>
            <CardTitle>Control de sincronización</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <div className="font-medium text-sm">Sync automático cada 5 minutos</div>
                <div className="text-xs text-muted-foreground">
                  Cron pg_cron. Requiere credenciales válidas (se activa en Fase 3).
                </div>
              </div>
              <Switch
                checked={cfg.enabled}
                onCheckedChange={(v) => toggleMut.mutate(v)}
                disabled={!credConfigured || toggleMut.isPending}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!credConfigured || syncMut.isPending}
                onClick={() => syncMut.mutate()}
              >
                {syncMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Sincronizar ahora
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ["gs-log"] });
                  qc.invalidateQueries({ queryKey: ["gs-config"] });
                }}
              >
                <RefreshCcw className="h-4 w-4 mr-2" /> Refrescar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* C — Historial */}
        <Card>
          <CardHeader>
            <CardTitle>Historial de sincronizaciones</CardTitle>
            <CardDescription>Últimos 50 syncs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Sheet</TableHead>
                  <TableHead className="text-right">Detectadas</TableHead>
                  <TableHead className="text-right">Nuevas</TableHead>
                  <TableHead className="text-right">Actualizadas</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Fallidas</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logQ.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Aún no hay syncs registrados
                    </TableCell>
                  </TableRow>
                )}
                {(logQ.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">
                      {new Date(row.started_at).toLocaleString("es-MX")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.sheet_program ?? "—"}{" "}
                      <span className="opacity-50 font-mono">
                        {row.sheet_id?.slice(0, 8)}…
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{row.rows_detected ?? 0}</TableCell>
                    <TableCell className="text-right">{row.rows_new ?? 0}</TableCell>
                    <TableCell className="text-right">{row.rows_updated ?? 0}</TableCell>
                    <TableCell className="text-right">{row.rows_skipped ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {(row.rows_failed ?? 0) > 0 ? (
                        <span className="text-destructive font-medium">{row.rows_failed}</span>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.duration_ms ? `${row.duration_ms} ms` : "—"}
                    </TableCell>
                    <TableCell>
                      {row.status === "ok" ? (
                        <Badge className="bg-emerald-600">ok</Badge>
                      ) : row.status === "failed" ? (
                        <Badge variant="destructive">failed</Badge>
                      ) : (
                        <Badge variant="outline">{row.status}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
