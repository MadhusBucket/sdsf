import { companyKey } from "./grouping";

/**
 * One fixed color per company. It is worked out from the company name (the same
 * way branches are grouped), so every branch of a company always gets the same
 * color, on every screen. Nothing is stored.
 */
export interface CompanyColor {
  /** Strong color: bars, dots. */
  solid: string;
  /** Soft background: avatar circle. */
  soft: string;
  /** Text on the soft background. */
  text: string;
}

const PALETTE: CompanyColor[] = [
  { solid: "#2f5bff", soft: "#e4eaff", text: "#2343c4" }, // blue
  { solid: "#38b6f5", soft: "#e0f4fe", text: "#0b7cb3" }, // sky
  { solid: "#7b4cf2", soft: "#eee7fe", text: "#5b30c9" }, // purple
  { solid: "#f26b1d", soft: "#fdebe0", text: "#b84a0c" }, // orange
  { solid: "#eeb021", soft: "#fdf3d6", text: "#8f6400" }, // yellow
  { solid: "#1fb35f", soft: "#dff5e8", text: "#127a3f" }, // green
  { solid: "#1ec7b4", soft: "#dcf7f3", text: "#0e7f72" }, // teal
  { solid: "#e5487a", soft: "#fde4ec", text: "#b0204f" }, // pink
  { solid: "#8a6a4f", soft: "#f1ebe5", text: "#64482f" }, // brown
  { solid: "#5a6b85", soft: "#e8ecf2", text: "#3c4a60" }, // slate
];

export function companyColor(name: string): CompanyColor {
  const key = companyKey(name);
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "PMJ Gems and Jewellers Pvt Ltd" → "PG". */
export function companyInitials(name: string) {
  const words = name
    .replace(/\b(pvt|private|ltd|limited|llp|and|the)\b\.?/gi, " ")
    .replace(/&/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}
