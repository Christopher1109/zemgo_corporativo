import zemgo from "@/assets/zemgo-logo.png.asset.json";

type Props = { className?: string };

/**
 * Zemgo institutional logo — yellow bird mark on dark backgrounds.
 * Zemgo is the customer-facing brand; the operating company (Hope Consulting)
 * stays in legal-only surfaces.
 */
export function ZemgoLogo({ className = "h-10 w-auto" }: Props) {
  return <img src={zemgo.url} alt="Zemgo" className={className} draggable={false} />;
}
