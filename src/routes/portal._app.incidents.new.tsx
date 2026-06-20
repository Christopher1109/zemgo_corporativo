import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { portalDashboard, portalReportIncident } from "@/lib/portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/portal/_app/incidents/new")({
  component: NewIncidentPage,
});

function NewIncidentPage() {
  const navigate = useNavigate();
  const dash = useServerFn(portalDashboard);
  const report = useServerFn(portalReportIncident);
  const { data } = useQuery({ queryKey: ["portal", "dashboard"], queryFn: () => dash() });
  const activePolicies = ((data as any)?.policies ?? []).filter((p: any) => p.status === "active");

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
    if (!form.policy_id) return toast.error("Selecciona una póliza");
    if (form.description.trim().length < 20) return toast.error("La descripción debe tener al menos 20 caracteres");
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
      toast.error("No fue posible reportar el siniestro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reportar siniestro</h1>
      <Card>
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Póliza</Label>
              <Select value={form.policy_id} onValueChange={(v) => setForm({ ...form, policy_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona tu póliza" /></SelectTrigger>
                <SelectContent>
                  {activePolicies.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.program?.code} · {p.folio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha del accidente</Label>
                <Input type="date" value={form.accident_date} onChange={(e) => setForm({ ...form, accident_date: e.target.value })} max={new Date().toISOString().slice(0,10)} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={form.accident_time} onChange={(e) => setForm({ ...form, accident_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Lugar</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Dirección o referencia" />
            </div>
            <div className="space-y-2">
              <Label>Hospital al que te diriges</Label>
              <Input value={form.hospital} onChange={(e) => setForm({ ...form, hospital: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Descripción detallada (mín. 20 caracteres)</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Enviando…" : "Enviar reporte"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
