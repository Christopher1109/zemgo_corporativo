import { Badge } from "@/components/ui/badge";

export function CertificateBadge({ number }: { number?: string | null }) {
  if (number && String(number).trim()) {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        Certificado N° {number}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
      Sin certificado
    </Badge>
  );
}
