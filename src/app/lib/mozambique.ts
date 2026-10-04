export type MozambiqueDocumentType =
  | "BI"
  | "Passaporte"
  | "Carta de Conducao"
  | "DIRE"
  | "Cartao de Eleitor"
  | "Cedula Pessoal"
  | "Certidao de Nascimento"
  | "Documento Militar";

type DocumentRule = {
  placeholder: string;
  hint: string;
  maxLength: number;
  normalize: (value: string) => string;
  validate: (value: string) => string | null;
};

const BI_DIGITS_LENGTH = 12;
const BI_MAX_LENGTH = 13;
const NUIT_LENGTH = 9;

function normalizeAlphaNumeric(value: string, maxLength: number): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, maxLength);
}

function normalizeDigits(value: string, maxLength: number): string {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, maxLength);
}

function normalizeBi(value: string): string {
  const raw = normalizeAlphaNumeric(value, BI_MAX_LENGTH);
  const digits = raw.replace(/[A-Z]/g, "").slice(0, BI_DIGITS_LENGTH);
  const lettersOnly = raw.replace(/[0-9]/g, "");
  const letter = lettersOnly ? lettersOnly.slice(-1) : "";
  return `${digits}${letter}`;
}

function validateBi(value: string): string | null {
  if (!value) return null;
  if (!/^\d{12}[A-Z]$/.test(value)) {
    return "BI invalido. Use 12 numeros e 1 letra no final.";
  }
  return null;
}

const DOCUMENT_RULES: Record<MozambiqueDocumentType, DocumentRule> = {
  BI: {
    placeholder: "Ex: 110011223344A",
    hint: "Formato: 12 numeros e 1 letra final.",
    maxLength: BI_MAX_LENGTH,
    normalize: normalizeBi,
    validate: validateBi,
  },
  Passaporte: {
    placeholder: "Ex: AB1234567",
    hint: "Formato comum: 1-2 letras e 6-7 numeros.",
    maxLength: 9,
    normalize: (value) => {
      const raw = normalizeAlphaNumeric(value, 9);
      const letters = raw.replace(/[0-9]/g, "").slice(0, 2);
      const digits = raw.replace(/\D/g, "").slice(0, 7);
      return `${letters}${digits}`.slice(0, 9);
    },
    validate: (value) => {
      if (!value) return null;
      return /^[A-Z]{1,2}\d{6,7}$/.test(value)
        ? null
        : "Passaporte invalido. Use 1-2 letras e 6-7 numeros.";
    },
  },
  "Carta de Conducao": {
    placeholder: "Ex: MZ123456789",
    hint: "Formato: letras e numeros (8 a 15 caracteres).",
    maxLength: 15,
    normalize: (value) => normalizeAlphaNumeric(value, 15),
    validate: (value) => {
      if (!value) return null;
      return /^[A-Z0-9]{8,15}$/.test(value)
        ? null
        : "Carta de Conducao invalida. Use 8 a 15 caracteres alfanumericos.";
    },
  },
  DIRE: {
    placeholder: "Ex: AB1234567",
    hint: "Formato comum: 2 letras e 6-8 numeros.",
    maxLength: 10,
    normalize: (value) => {
      const raw = normalizeAlphaNumeric(value, 10);
      const letters = raw.replace(/[0-9]/g, "").slice(0, 2);
      const digits = raw.replace(/\D/g, "").slice(0, 8);
      return `${letters}${digits}`.slice(0, 10);
    },
    validate: (value) => {
      if (!value) return null;
      return /^[A-Z]{2}\d{6,8}$/.test(value)
        ? null
        : "DIRE invalido. Use 2 letras e 6-8 numeros.";
    },
  },
  "Cartao de Eleitor": {
    placeholder: "Ex: 123456789012",
    hint: "Formato: somente numeros (8 a 14 digitos).",
    maxLength: 14,
    normalize: (value) => normalizeDigits(value, 14),
    validate: (value) => {
      if (!value) return null;
      return /^\d{8,14}$/.test(value) ? null : "Cartao de Eleitor invalido. Use 8 a 14 numeros.";
    },
  },
  "Cedula Pessoal": {
    placeholder: "Ex: CP12345678",
    hint: "Formato: letras e numeros (6 a 14 caracteres).",
    maxLength: 14,
    normalize: (value) => normalizeAlphaNumeric(value, 14),
    validate: (value) => {
      if (!value) return null;
      return /^[A-Z0-9]{6,14}$/.test(value) ? null : "Cedula Pessoal invalida. Use 6 a 14 caracteres.";
    },
  },
  "Certidao de Nascimento": {
    placeholder: "Ex: CN-2025-123456",
    hint: "Formato: letras, numeros e '-' (6 a 25 caracteres).",
    maxLength: 25,
    normalize: (value) =>
      String(value || "")
        .toUpperCase()
        .replace(/[^0-9A-Z-]/g, "")
        .slice(0, 25),
    validate: (value) => {
      if (!value) return null;
      return /^[A-Z0-9-]{6,25}$/.test(value)
        ? null
        : "Certidao de Nascimento invalida. Use 6 a 25 caracteres validos.";
    },
  },
  "Documento Militar": {
    placeholder: "Ex: DM123456",
    hint: "Formato: letras, numeros e '-' (6 a 20 caracteres).",
    maxLength: 20,
    normalize: (value) =>
      String(value || "")
        .toUpperCase()
        .replace(/[^0-9A-Z-]/g, "")
        .slice(0, 20),
    validate: (value) => {
      if (!value) return null;
      return /^[A-Z0-9-]{6,20}$/.test(value)
        ? null
        : "Documento Militar invalido. Use 6 a 20 caracteres validos.";
    },
  },
};

export const MOZAMBIQUE_DOCUMENT_OPTIONS: Array<{ value: MozambiqueDocumentType; label: string }> = [
  { value: "BI", label: "BI - Bilhete de Identidade" },
  { value: "Carta de Conducao", label: "Carta de Conducao" },
  { value: "Passaporte", label: "Passaporte" },
  { value: "DIRE", label: "DIRE (Estrangeiro Residente)" },
  { value: "Cartao de Eleitor", label: "Cartao de Eleitor" },
  { value: "Cedula Pessoal", label: "Cedula Pessoal" },
  { value: "Certidao de Nascimento", label: "Certidao de Nascimento" },
  { value: "Documento Militar", label: "Documento Militar" },
];

export function normalizeMozDocumentNumber(value: string, documentType: string): string {
  const rule = DOCUMENT_RULES[documentType as MozambiqueDocumentType];
  if (!rule) return normalizeAlphaNumeric(value, 30);
  return rule.normalize(value);
}

export function validateMozDocumentNumber(value: string, documentType: string): string | null {
  if (!documentType && !value) return null;
  if (documentType && !value) return "Informe o numero do documento.";
  if (!documentType && value) return "Selecione o tipo de documento.";
  const rule = DOCUMENT_RULES[documentType as MozambiqueDocumentType];
  if (!rule) return null;
  return rule.validate(value);
}

export function getMozDocumentInputConfig(documentType: string): { placeholder: string; hint: string; maxLength: number } {
  const rule = DOCUMENT_RULES[documentType as MozambiqueDocumentType];
  if (!rule) {
    return {
      placeholder: "Ex: Numero do documento",
      hint: "Selecione o tipo para aplicar formato automatico.",
      maxLength: 30,
    };
  }
  return {
    placeholder: rule.placeholder,
    hint: rule.hint,
    maxLength: rule.maxLength,
  };
}

export function normalizeMozNuit(value: string): string {
  return normalizeDigits(value, NUIT_LENGTH);
}

export function validateMozNuit(value: string): string | null {
  if (!value) return null;
  if (!/^\d{9}$/.test(value)) return "NUIT invalido. Use exatamente 9 digitos.";
  return null;
}

export const MOZAMBIQUE_DISTRICTS_BY_PROVINCE: Record<string, string[]> = {
  "Cidade de Maputo": [
    "KaMpfumo",
    "Nlhamankulu",
    "KaMaxaquene",
    "KaMavota",
    "KaMubukwana",
    "KaTembe",
    "KaNyaka",
  ],
  "Provincia de Maputo": [
    "Boane",
    "Magude",
    "Manhica",
    "Marracuene",
    "Matola",
    "Matutuine",
    "Moamba",
    "Namaacha",
  ],
  Gaza: [
    "Bilene",
    "Chibuto",
    "Chicualacuala",
    "Chigubo",
    "Chokwe",
    "Guija",
    "Mabalane",
    "Mandlakazi",
    "Massangena",
    "Massingir",
    "Xai-Xai",
  ],
  Inhambane: [
    "Funhalouro",
    "Govuro",
    "Homoine",
    "Inhambane",
    "Inharrime",
    "Inhassoro",
    "Jangamo",
    "Mabote",
    "Massinga",
    "Maxixe",
    "Morrumbene",
    "Panda",
    "Vilankulo",
    "Zavala",
  ],
  Manica: [
    "Barue",
    "Chimoio",
    "Gondola",
    "Guro",
    "Machaze",
    "Macossa",
    "Manica",
    "Mossurize",
    "Sussundenga",
    "Tambara",
    "Vanduzi",
  ],
  Sofala: [
    "Beira",
    "Buzi",
    "Caia",
    "Chemba",
    "Cheringoma",
    "Chibabava",
    "Dondo",
    "Gorongosa",
    "Machanga",
    "Maringue",
    "Marromeu",
    "Muanza",
    "Nhamatanda",
  ],
  Tete: [
    "Angonia",
    "Cahora-Bassa",
    "Changara",
    "Chifunde",
    "Chiuta",
    "Doa",
    "Macanga",
    "Magoe",
    "Maravia",
    "Moatize",
    "Mutarara",
    "Tete",
    "Tsangano",
    "Zumbo",
  ],
  Zambezia: [
    "Alto Molocue",
    "Chinde",
    "Derre",
    "Gile",
    "Gurue",
    "Ile",
    "Inhassunge",
    "Luabo",
    "Lugela",
    "Maganja da Costa",
    "Milange",
    "Mocuba",
    "Mopeia",
    "Morrumbala",
    "Mulevala",
    "Namacurra",
    "Namarroi",
    "Nicoadala",
    "Pebane",
    "Quelimane",
  ],
  Nampula: [
    "Angoche",
    "Erati",
    "Ilha de Mocambique",
    "Lalaua",
    "Larde",
    "Liupo",
    "Malema",
    "Meconta",
    "Mecuburi",
    "Memba",
    "Mogincual",
    "Mogovolas",
    "Moma",
    "Monapo",
    "Mossuril",
    "Muecate",
    "Murrupula",
    "Nacala-a-Velha",
    "Nacala Porto",
    "Nacaroa",
    "Nampula",
    "Rapale",
    "Ribaue",
  ],
  "Cabo Delgado": [
    "Ancuabe",
    "Balama",
    "Chiure",
    "Ibo",
    "Macomia",
    "Mecufi",
    "Meluco",
    "Metuge",
    "Mocimboa da Praia",
    "Montepuez",
    "Mueda",
    "Muidumbe",
    "Namuno",
    "Nangade",
    "Palma",
    "Pemba",
    "Quissanga",
  ],
  Niassa: [
    "Chimbonila",
    "Cuamba",
    "Lago",
    "Lichinga",
    "Majune",
    "Mandimba",
    "Marrupa",
    "Maua",
    "Mavago",
    "Mecula",
    "Metarica",
    "Muembe",
    "Ngauma",
    "Nipepe",
    "Sanga",
  ],
};

export const MOZAMBIQUE_PROVINCES = Object.keys(MOZAMBIQUE_DISTRICTS_BY_PROVINCE);

export function getMozDistrictsByProvince(province: string): string[] {
  return MOZAMBIQUE_DISTRICTS_BY_PROVINCE[province] || [];
}

export function formatMozAddress(province: string, district: string, neighborhood: string): string {
  const parts: string[] = [];
  if (province) parts.push(`Provincia: ${province}`);
  if (district) parts.push(`Distrito: ${district}`);
  if (neighborhood) parts.push(`Bairro: ${neighborhood}`);
  return parts.join(" | ");
}

export function parseMozAddress(rawAddress: string | null | undefined): {
  province: string;
  district: string;
  neighborhood: string;
} {
  const raw = String(rawAddress || "").trim();
  const result = {
    province: "",
    district: "",
    neighborhood: "",
  };
  if (!raw) return result;

  const segments = raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (segments.length === 0) return result;

  for (const segment of segments) {
    if (segment.toLowerCase().startsWith("provincia:")) {
      result.province = segment.slice("provincia:".length).trim();
      continue;
    }
    if (segment.toLowerCase().startsWith("distrito:")) {
      result.district = segment.slice("distrito:".length).trim();
      continue;
    }
    if (segment.toLowerCase().startsWith("bairro:")) {
      result.neighborhood = segment.slice("bairro:".length).trim();
      continue;
    }
  }

  if (!result.province && !result.district && !result.neighborhood) {
    result.neighborhood = raw;
  }

  return result;
}
