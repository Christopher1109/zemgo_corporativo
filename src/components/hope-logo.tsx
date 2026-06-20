import logoDark from "@/assets/hope-logo-dark.png.asset.json";
import logoLight from "@/assets/hope-logo-light.png.asset.json";

type Props = {
  variant?: "light" | "dark";
  className?: string;
};

/**
 * Hope Consulting institutional logo.
 * - `dark` variant: black "HOPE / CONSULTING" — use on light surfaces.
 * - `light` variant: white "HOPE / CONSULTING" — use on dark surfaces.
 */
export function HopeLogo({ variant = "dark", className = "h-10 w-auto" }: Props) {
  const src = variant === "light" ? logoLight.url : logoDark.url;
  return <img src={src} alt="Hope Consulting" className={className} draggable={false} />;
}
