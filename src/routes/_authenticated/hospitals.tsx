import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useProgram } from "@/lib/program-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/hospitals")({
  head: () => ({ meta: [{ title: "Hospitales — ZEMGO" }] }),
  component: HospitalsPage,
});

type Hospital = {
  id: string;
  program_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  is_active: boolean;
};

function emptyForm(programId: string): Partial<Hospital> {
  return {
    program_id: programId, name: "", address: "", city: "", state: "",
    phone: "", lat: null, lng: null, notes: "", is_active: true,
  };
}

function HospitalsPage() {
  const { activeProgram } = useProgram();
  const qc = useQueryClient();
  const programId = activeProgram?.id;

  const { data: hospitals = [], isLoading } = useQuery({
    queryKey: ["hospitals", programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitals" as any)
        .select("*")
        .eq("program_id", programId!)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as unknown) as Hospital[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Hospital> | null>(null);

  function openNew() {
    if (!programId) return;
    setEditing(emptyForm(programId));
    setOpen(true);
  }
  function openEdit(h: Hospital) {
    setEditing({ ...h });
    setOpen(true);
  }

  async function save() {
    if (!editing || !programId) return;
    if (!editing.name?.trim()) return toast.error("Escribe el nombre del hospital");
    const payload: any = {
      program_id: programId,
      name: editing.name.trim(),
      address: editing.address || null,
      city: editing.city || null,
      state: editing.state || null,
      phone: editing.phone || null,
      lat: editing.lat === null || editing.lat === undefined || (editing.lat as any) === "" ? null : Number(editing.lat),
      lng: editing.lng === null || editing.lng === undefined || (editing.lng as any) === "" ? null : Number(editing.lng),
      notes: editing.notes || null,
      is_active: editing.is_active ?? true,
    };
    const isEdit = !!editing.id;
    const q = isEdit
      ? supabase.from("hospitals" as any).update(payload).eq("id", editing.id!)
      : supabase.from("hospitals" as any).insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Hospital actualizado" : "Hospital agregado");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["hospitals", programId] });
  }

  async function remove(h: Hospital) {
    if (!confirm(`¿Eliminar "${h.name}"?`)) return;
    const { error } = await supabase.from("hospitals" as any).delete().eq("id", h.id);
    if (error) return toast.error(error.message);
    toast.success("Hospital eliminado");
    qc.invalidateQueries({ queryKey: ["hospitals", programId] });
  }

  async function toggleActive(h: Hospital) {
    const { error } = await supabase
      .from("hospitals" as any)
      .update({ is_active: !h.is_active })
      .eq("id", h.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hospitals", programId] });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error("Geolocalización no disponible");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditing((e) => e && { ...e, lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Ubicación capturada");
      },
      () => toast.error("No se pudo obtener la ubicación"),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hospitales</h1>
          <p className="text-sm text-muted-foreground">
            Red de hospitales autorizados para el programa {activeProgram?.name ?? "seleccionado"}.
          </p>
        </div>
        <Button onClick={openNew} disabled={!programId}>
          <Plus className="h-4 w-4 mr-2" /> Agregar hospital
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : hospitals.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Aún no hay hospitales. Agrega el primero.</TableCell></TableRow>
            ) : hospitals.map((h) => (
              <TableRow key={h.id}>
                <TableCell>
                  <div className="font-medium">{h.name}</div>
                  {h.address && <div className="text-xs text-muted-foreground">{h.address}</div>}
                </TableCell>
                <TableCell>{[h.city, h.state].filter(Boolean).join(", ") || "—"}</TableCell>
                <TableCell>{h.phone || "—"}</TableCell>
                <TableCell>
                  {h.lat != null && h.lng != null ? (
                    <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {Number(h.lat).toFixed(3)}, {Number(h.lng).toFixed(3)}</Badge>
                  ) : <span className="text-muted-foreground text-xs">Sin coords</span>}
                </TableCell>
                <TableCell>
                  <Switch checked={h.is_active} onCheckedChange={() => toggleActive(h)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(h)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(h)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar hospital" : "Agregar hospital"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ciudad</Label>
                  <Input value={editing.city ?? ""} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Input value={editing.state ?? ""} onChange={(e) => setEditing({ ...editing, state: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Latitud</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={editing.lat ?? ""}
                    onChange={(e) => setEditing({ ...editing, lat: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitud</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={editing.lng ?? ""}
                    onChange={(e) => setEditing({ ...editing, lng: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
                <MapPin className="h-4 w-4 mr-2" /> Usar mi ubicación actual
              </Button>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Especialidades, horarios, contactos, etc." />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <span className="text-sm">Activo</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
