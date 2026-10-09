import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

const FALLBACK = "No se pudo enviar el recordatorio";

/** Llama a resend-payment-reminder y regresa el mensaje de error en español (o null si fue exitoso). */
export async function invokePaymentReminder(paymentId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("resend-payment-reminder", {
      body: { payment_id: paymentId },
    });
    if (error) {
      try {
        const body = await (error as any).context?.json();
        return body?.message || FALLBACK;
      } catch {
        return FALLBACK;
      }
    }
    if (data && (data as any).ok === false) return (data as any).message || FALLBACK;
    return null;
  } catch {
    return FALLBACK;
  }
}

export function SendPaymentReminderButton({
  paymentId,
  clientName,
  paymentStatus,
  hasPhone,
  size = "sm",
  className,
}: {
  paymentId: string;
  clientName: string;
  paymentStatus: string;
  hasPhone: boolean;
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const eligible = paymentStatus === "pending" || paymentStatus === "overdue";
  const disabled = !eligible || !hasPhone;

  async function send() {
    setSending(true);
    const err = await invokePaymentReminder(paymentId);
    setSending(false);
    if (err) return toast.error(err);
    toast.success(`Recordatorio enviado a ${clientName}`);
    setOpen(false);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["payment-reminder-status"] }),
      qc.invalidateQueries({ queryKey: ["whatsapp", "reminder-log"] }),
      qc.invalidateQueries({ queryKey: ["client-urgent-payments"] }),
      qc.invalidateQueries({ queryKey: ["policy-payments-full"] }),
      qc.invalidateQueries({ queryKey: ["policy-payments-timeline"] }),
      qc.invalidateQueries({ queryKey: ["payment", paymentId] }),
      qc.invalidateQueries({ queryKey: ["payment-history", paymentId] }),
    ]);
  }

  const button = (
    <Button
      size={size}
      variant="outline"
      className={className}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <Send className="h-4 w-4 mr-1.5" />
      Enviar recordatorio
    </Button>
  );

  return (
    <span onClick={(e) => e.stopPropagation()}>
      {eligible && !hasPhone ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-block">{button}</span>
            </TooltipTrigger>
            <TooltipContent>Agrega un teléfono al cliente para enviar el recordatorio</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
      <AlertDialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar recordatorio de pago</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Enviar recordatorio de pago por WhatsApp a {clientName}? Esto genera un cargo de WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
