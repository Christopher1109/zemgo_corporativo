import zemgo from "@/assets/zemgo-logo.png.asset.json";

type Props = {
  className?: string;
  /** Legacy prop from HopeLogo — Zemgo mark works on any background, so it's ignored. */
  variant?: "light" | "dark";
};

/**
 * Zemgo institutional logo — yellow bird mark. Zemgo is the customer-facing
 * brand; the operating company (Hope Consulting) stays in legal-only surfaces.
 */
export function ZemgoLogo({ className = "h-10 w-auto" }: Props) {
  return <img src={zemgo.url} alt="ZEMGO" className={className} draggable={false} />;
}
