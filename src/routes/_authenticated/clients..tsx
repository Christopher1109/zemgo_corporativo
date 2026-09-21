
const STATUS_EFFECTS: Record<string, string> = {
  prospect:
    "El cliente queda como prospecto: no se considera activo para cobranza ni comisiones y no aparece en reportes de cartera activa.",
  active:
    "El cliente queda activo: entra en cobranza, recordatorios de pago, renovaciones y puede emitir siniestros.",
  inactive:
    "El cliente queda inactivo: se detienen recordatorios y renovaciones, pero se conserva su historial.",
  cancelled:
    "El cliente queda cancelado: se registra la fecha de cancelación, se detiene toda cobranza y pierde vigencia en el programa.",
};

function EnrollmentStatusControl({
  enrollment,
  clientId,
}: {
  enrollment: any;
  clientId: string;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = CP_STATUS[enrollment.status] ?? { label: enrollment.status, cls: "" };

  async function apply(next: string) {
    setBusy(true);
    const payload: Record<string, any> = { status: next };
    payload.cancelled_at = next === "cancelled" ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("client_programs")
      .update(payload as any)
      .eq("id", enrollment.id);
    setBusy(false);
    setTarget(null);
    if (error) return toast.error(error.message);
    toast.success(`Estatus actualizado a ${CP_STATUS[next]?.label ?? next}.`);
    await qc.invalidateQueries({ queryKey: ["client-programs", clientId] });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1" disabled={busy}>
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${current.cls}`}>
              {enrollment.programs?.code}: {current.label}
            </span>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Cambiar estatus</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {Object.entries(CP_STATUS).map(([key, st]) => (
            <DropdownMenuItem
              key={key}
              disabled={key === enrollment.status}
              onSelect={(ev) => {
                ev.preventDefault();
                setTarget(key);
              }}
            >
              {st.label}
              {key === enrollment.status && <span className="ml-auto text-xs text-muted-foreground">actual</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cambiar a {target ? (CP_STATUS[target]?.label ?? target) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Programa {enrollment.programs?.name}. {target ? STATUS_EFFECTS[target] : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => target && apply(target)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
