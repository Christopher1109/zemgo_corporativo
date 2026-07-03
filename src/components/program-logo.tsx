import abc from "@/assets/program-abc.png.asset.json";
import futcare from "@/assets/program-futcare.png.asset.json";
import mcv from "@/assets/program-mcv.png.asset.json";

const MAP: Record<string, { url: string; alt: string }> = {
  ABC: { url: abc.url, alt: "ABC de Protección" },
  FUTCARE: { url: futcare.url, alt: "FUT-CARE" },
  "FUT-CARE": { url: futcare.url, alt: "FUT-CARE" },
  MCV: { url: mcv.url, alt: "Manos con Valor" },
  MANOSCONVALOR: { url: mcv.url, alt: "Manos con Valor" },
};

type Props = { code?: string | null; className?: string };

export function ProgramLogo({ code, className = "h-8 w-auto" }: Props) {
  const entry = code ? MAP[code.toUpperCase()] : undefined;
  if (!entry) return null;
  return (
    <img
      src={entry.url}
      alt={entry.alt}
      className={className}
      draggable={false}
    />
  );
}
