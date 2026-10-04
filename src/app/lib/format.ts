function toFiniteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: unknown): string {
  return moneyFormatter.format(toFiniteNumber(value));
}

export function formatCurrencyMT(value: unknown): string {
  return `${formatCurrency(value)} MT`;
}

export function parseCurrencyInput(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const compact = raw.replace(/\s+/g, "");
  const commaCount = (compact.match(/,/g) || []).length;
  const dotCount = (compact.match(/\./g) || []).length;

  let normalized = compact;
  if (commaCount > 0 && dotCount > 0) {
    normalized =
      compact.lastIndexOf(",") > compact.lastIndexOf(".")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
  } else if (commaCount > 0) {
    normalized = commaCount > 1 ? compact.replace(/,/g, "") : compact.replace(",", ".");
  } else if (dotCount > 1) {
    const lastDot = compact.lastIndexOf(".");
    normalized = `${compact.slice(0, lastDot).replace(/\./g, "")}.${compact.slice(lastDot + 1)}`;
  }

  const safe = normalized.replace(/[^\d.-]/g, "");
  const parsed = Number(safe);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrencyInput(value: unknown, options?: { emptyIfZero?: boolean }): string {
  const numeric = toFiniteNumber(value);
  if (options?.emptyIfZero && numeric === 0) return "";
  return formatCurrency(numeric);
}
