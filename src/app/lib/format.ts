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
    normalized = compact.lastIndexOf(",") > compact.lastIndexOf(".")
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

// Mapa de moedas suportadas
export type CurrencyCode = 'MZN' | 'USD' | 'EUR' | 'ZAR' | 'AOA' | 'BRL' | 'GBP' | 'KES' | 'TZS' | 'XOF';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  MZN: { code: 'MZN', symbol: 'MT', name: 'Metical Moçambicano', locale: 'pt-MZ', decimals: 2 },
  USD: { code: 'USD', symbol: '$', name: 'Dólar Americano', locale: 'en-US', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'pt-PT', decimals: 2 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'Rand Sul-Africano', locale: 'en-ZA', decimals: 2 },
  AOA: { code: 'AOA', symbol: 'Kz', name: 'Kwanza Angolano', locale: 'pt-AO', decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Real Brasileiro', locale: 'pt-BR', decimals: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'Libra Esterlina', locale: 'en-GB', decimals: 2 },
  KES: { code: 'KES', symbol: 'KSh', name: 'Xelim Queniano', locale: 'en-KE', decimals: 2 },
  TZS: { code: 'TZS', symbol: 'TSh', name: 'Xelim Tanzaniano', locale: 'sw-TZ', decimals: 0 },
  XOF: { code: 'XOF', symbol: 'CFA', name: 'Franco CFA', locale: 'fr-SN', decimals: 0 },
};

// Formatter dinâmico com cache
const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatCurrencyDynamic(value: unknown, currencyCode: CurrencyCode = 'MZN'): string {
  const config = CURRENCIES[currencyCode] || CURRENCIES.MZN;
  const key = `${config.locale}-${config.decimals}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(key, new Intl.NumberFormat(config.locale, {
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }));
  }
  return `${formatterCache.get(key)!.format(toFiniteNumber(value))} ${config.symbol}`;
}

export function getCurrencySymbol(currencyCode: CurrencyCode = 'MZN'): string {
  return (CURRENCIES[currencyCode] || CURRENCIES.MZN).symbol;
}

export function getCurrencyList(): CurrencyConfig[] {
  return Object.values(CURRENCIES);
}
