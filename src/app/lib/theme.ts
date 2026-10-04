export type SystemFontSize = "small" | "normal" | "large" | "xlarge";
export type SystemThemeColor = "emerald" | "blue" | "purple" | "slate";

const FONT_SIZE_KEY = "msu_system_font_size";
const THEME_COLOR_KEY = "msu_system_theme_color";

export const FONT_SIZES: Array<{ id: SystemFontSize; label: string; px: string; scale: string; desc: string }> = [
  { id: "small", label: "Pequeno", px: "13px", scale: "85%", desc: "Ideal para telas compactas e maior densidade de dados" },
  { id: "normal", label: "Normal (Padrão)", px: "15px", scale: "100%", desc: "Tamanho equilibrado recomendado para uso diário" },
  { id: "large", label: "Grande", px: "17px", scale: "115%", desc: "Maior legibilidade em monitores médios e grandes" },
  { id: "xlarge", label: "Extra Grande", px: "19px", scale: "130%", desc: "Máximo conforto visual e textos ampliados" },
];

export const THEME_COLORS: Array<{ id: SystemThemeColor; label: string; primaryHex: string; desc: string }> = [
  { id: "emerald", label: "Verde Esmeralda (Oficial)", primaryHex: "#059669", desc: "Identidade corporativa tradicional e equilibrada" },
  { id: "blue", label: "Azul Financeiro", primaryHex: "#2563eb", desc: "Visual moderno bancário e tecnológico" },
  { id: "purple", label: "Roxo Premium", primaryHex: "#7c3aed", desc: "Estilo sofisticado e inovador" },
  { id: "slate", label: "Ardósia Corporativo", primaryHex: "#475569", desc: "Tons sóbrios e elegantes de alto contraste" },
];

export function getSystemFontSize(): SystemFontSize {
  if (typeof window === "undefined") return "normal";
  const stored = localStorage.getItem(FONT_SIZE_KEY) as SystemFontSize | null;
  if (stored && ["small", "normal", "large", "xlarge"].includes(stored)) {
    return stored;
  }
  return "normal";
}

export function setSystemFontSize(size: SystemFontSize) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FONT_SIZE_KEY, size);
  applySystemFontSize(size);
}

export function applySystemFontSize(size?: SystemFontSize) {
  if (typeof document === "undefined") return;
  const current = size || getSystemFontSize();
  const root = document.documentElement;
  
  switch (current) {
    case "small":
      root.style.fontSize = "13.5px";
      break;
    case "normal":
      root.style.fontSize = "15px";
      break;
    case "large":
      root.style.fontSize = "16.5px";
      break;
    case "xlarge":
      root.style.fontSize = "18px";
      break;
    default:
      root.style.fontSize = "15px";
  }
  root.setAttribute("data-font-size", current);
}

export function getSystemTheme(): SystemThemeColor {
  if (typeof window === "undefined") return "emerald";
  const stored = localStorage.getItem(THEME_COLOR_KEY) as SystemThemeColor | null;
  if (stored && ["emerald", "blue", "purple", "slate"].includes(stored)) {
    return stored;
  }
  return "emerald";
}

export function setSystemTheme(theme: SystemThemeColor) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_COLOR_KEY, theme);
  applySystemTheme(theme);
}

export function applySystemTheme(theme?: SystemThemeColor) {
  if (typeof document === "undefined") return;
  const current = theme || getSystemTheme();
  const root = document.documentElement;
  root.setAttribute("data-theme", current);
}
