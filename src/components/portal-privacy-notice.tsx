import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const STORAGE_PREFIX = "zemgo_privacy_accepted_v1_";

export function PortalPrivacyNotice({ clientId }: { clientId: string }) {
  const key = STORAGE_PREFIX + clientId;
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(key)) setOpen(true);
  }, [key]);

  if (!open) return null;

  function accept() {
    localStorage.setItem(key, new Date().toISOString());
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-900">Aviso de Privacidad</h2>
          <p className="text-xs text-slate-500 mt-0.5">Debes aceptar el aviso para continuar usando el portal.</p>
        </div>
        <div className="px-6 py-4 overflow-y-auto text-sm text-slate-700 leading-relaxed space-y-3">
          <p>
            <strong>ZEMGO AGENTE DE SEGUROS Y DE FIANZAS S.A. DE C.V.</strong>, con domicilio en Anillo Periférico #1637,
            entre calle Barcelona y Calle Cádiz, en la colonia Rincón de San Jerónimo, Monterrey, Nuevo León, México, es
            responsable de recabar sus datos personales, del uso que se le da a los mismos y de su protección.
          </p>
          <p>
            Con el fin de cumplir con el contrato de seguro o fianza solicitado, Zemgo Agente de Seguros y De Fianzas,
            S.A. de C.V. recabará la siguiente información, más no limitada a:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Datos personales de identificación:</strong> nombre completo, dirección, teléfono, fecha de nacimiento, peso y estatura.</li>
            <li><strong>Datos patrimoniales:</strong> datos bancarios, nivel de ingresos, actividad económica.</li>
            <li><strong>Datos sensibles:</strong> estado de salud, afiliación sindical, exposición política, descendencia familiar o étnica.</li>
          </ul>
          <p>
            Dicha información podrá ser recabada por distintas fuentes: solicitudes de seguros o fianzas, formatos
            electrónicos o verbal. Esta información solo será provista a la(s) compañía(s) aseguradora(s) o
            afianzadora(s) con la cual se pretenda establecer un vínculo comercial.
          </p>
          <p>
            Toda información recabada será tratada con confidencialidad. Estos datos podrán ser compartidos con terceros
            en los siguientes casos:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Para dar cumplimiento al(los) contrato(s) celebrados con el Titular y/o con terceros.</li>
            <li>En los que la autoridad lo demande.</li>
            <li>En el cumplimiento de cualquier otra ley.</li>
            <li>En los demás casos previstos por las leyes aplicables.</li>
          </ul>
          <p>
            En caso de que el Titular desee acceder, revocar, cancelar u oponerse al uso de estos datos, podrá presentar
            por escrito dicha solicitud a:
          </p>
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs space-y-0.5">
            <div><strong>Dirección:</strong> Blvd. Rogelio Cantú Gómez #1000 local 82 Tercer Piso, Col. Hacienda San Jerónimo, Monterrey, Nuevo León, México</div>
            <div><strong>Teléfono:</strong> (81) 1492 2200</div>
            <div><strong>Horario:</strong> lunes a viernes de 8:30 a.m. a 2:00 p.m. y de 3:00 p.m. a 6:00 p.m.</div>
            <div><strong>Correo:</strong> contacto@hope.com.mx</div>
          </div>
          <p className="text-xs text-slate-500">
            Zemgo se reserva el derecho de modificar estos términos en cualquier momento sin previo aviso.
          </p>
        </div>
        <div className="px-6 py-4 border-t space-y-3 bg-slate-50 rounded-b-lg">
          <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
            <span>He leído y <strong>acepto</strong> el Aviso de Privacidad de Zemgo.</span>
          </label>
          <div className="flex justify-end">
            <Button onClick={accept} disabled={!checked}>Aceptar y continuar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
