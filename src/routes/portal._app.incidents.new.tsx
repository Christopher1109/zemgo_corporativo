import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { portalDashboard, portalReportIncident, portalHospitals } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, CreditCard, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/portal/_app/incidents/new")({
  component: NewIncidentPage,
});

function isActivated(p: any) {
  // El RPC report_portal_incident exige status = 'active'.
  // Un pago 'paid' no basta si la póliza aún está suspendida/pendiente:
  // el backend rechazaría con 'poliza_inactiva'.
  return p.status === "active";
}

function NewIncidentPage() {
  const navigate = useNavigate();
  const dash = useServerFn(portalDashboard);
  const report = useServerFn(portalReportIncident);
  const { data, isLoading } = useQuery({ queryKey: ["portal", "dashboard"], queryFn: () => dash() });

  const allPolicies = ((data as any)?.policies ?? []) as any[];
  const eligiblePolicies = allPolicies.filter((p) => isActivated(p) && p.status !== "cancelled" && p.status !== "expired");

  const [form, setForm] = useState({
    policy_id: "",
    accident_date: new Date().toISOString().slice(0, 10),
    accident_time: "",
    location: "",
    description: "",
    hospital: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.policy_id) return toast.error("Selecciona un certificado");
    if (form.description.trim().length < 20)
      return toast.error("La descripción debe tener al menos 20 caracteres");
    setSaving(true);
    try {
      await report({
        data: {
          policy_id: form.policy_id,
          accident_date: form.accident_date,
          accident_time: form.accident_time || null,
          location: form.location,
          description: form.description,
          hospital: form.hospital,
        },
      });
      toast.success("Reporte recibido. Tu siniestro está en revisión. Te contactaremos por WhatsApp.");
      navigate({ to: "/portal/incidents" });
    } catch (err: any) {
      const raw = String(err?.message ?? err ?? "");
      const map: Record<string, string> = {
        sesion_invalida: "Tu sesión expiró. Vuelve a iniciar sesión.",
        poliza_no_encontrada: "El certificado seleccionado no está disponible.",
        poliza_inactiva: "El certificado no está vigente. Completa el pago para activarlo.",
        fecha_invalida: "La fecha del accidente no es válida.",
        descripcion_muy_corta: "La descripción debe tener al menos 20 caracteres.",
      };
      const key = Object.keys(map).find((k) => raw.includes(k));
      toast.error(key ? map[key] : `No fue posible reportar el siniestro: ${raw || "error desconocido"}`);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="text-slate-500">Cargando…</div>;
  }

  // ===== No eligible policy =====
  if (eligiblePolicies.length === 0) {
    const hasPending = allPolicies.some((p) => !isActivated(p));
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-slate-900">Reportar siniestro</h1>
        <Card className="border-yellow-300 bg-yellow-50/60">
          <CardContent className="p-6 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <Lock className="h-6 w-6 text-yellow-700" />
            </div>
            <h3 className="font-semibold text-slate-900">
              {hasPending ? "Activa tu seguro primero" : "No tienes certificados vigentes"}
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              {hasPending
                ? "Para reportar un siniestro necesitas tener al menos un certificado vigente. Completa tu pago para activarlo."
                : "Aún no cuentas con un certificado vigente al cual reportar un siniestro."}
            </p>
            {hasPending && (
              <Button asChild className="bg-slate-900 hover:bg-slate-800">
                <Link to="/portal/payments">
                  <CreditCard className="mr-2 h-4 w-4" /> Proceder con el pago
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportar siniestro</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Comparte los detalles del accidente. Un asesor te contactará por WhatsApp.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Si la situación es de emergencia llama al <strong>911</strong> antes de reportar aquí.
        </span>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Certificado</Label>
              <Select
                value={form.policy_id}
                onValueChange={(v) => setForm({ ...form, policy_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tu certificado" />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePolicies.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.program?.name ?? p.program?.code} · Folio {p.folio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha del accidente</Label>
                <Input
                  type="date"
                  value={form.accident_date}
                  onChange={(e) => setForm({ ...form, accident_date: e.target.value })}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={form.accident_time}
                  onChange={(e) => setForm({ ...form, accident_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Lugar</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Dirección o referencia"
              />
            </div>
            <div className="space-y-2">
              <Label>Hospital al que te diriges</Label>
              <Input
                value={form.hospital}
                onChange={(e) => setForm({ ...form, hospital: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción detallada (mín. 20 caracteres)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                placeholder="Describe lo que ocurrió: cómo, dónde, qué lesiones presentas…"
              />
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-slate-900 hover:bg-slate-800"
            >
              {saving ? "Enviando…" : "Enviar reporte"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
