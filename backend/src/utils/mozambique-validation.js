const NUIT_LENGTH = 9;
const BI_MAX_LENGTH = 13;
const BI_DIGITS_LENGTH = 12;

export const MOZAMBIQUE_DOCUMENT_TYPES = new Set([
  "BI",
  "Passaporte",
  "Carta de Conducao",
  "DIRE",
  "Cartao de Eleitor",
  "Cedula Pessoal",
  "Certidao de Nascimento",
  "Documento Militar",
]);

function normalizeAlphaNumeric(value, maxLength) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, maxLength);
}

function normalizeDigits(value, maxLength) {
  return String(value || "").replace(/\D/g, "").slice(0, maxLength);
}

function normalizeBi(value) {
  const raw = normalizeAlphaNumeric(value, BI_MAX_LENGTH);
  const digits = raw.replace(/[A-Z]/g, "").slice(0, BI_DIGITS_LENGTH);
  const lettersOnly = raw.replace(/[0-9]/g, "");
  const letter = lettersOnly ? lettersOnly.slice(-1) : "";
  return `${digits}${letter}`;
}

const DOCUMENT_RULES = {
  BI: {
    normalize: normalizeBi,
    validate: (value) => (/^\d{12}[A-Z]$/.test(value) ? null : "BI invalido. Use 12 numeros e 1 letra no final."),
  },
  Passaporte: {
    normalize: (value) => {
      const raw = normalizeAlphaNumeric(value, 9);
      const letters = raw.replace(/[0-9]/g, "").slice(0, 2);
      const digits = raw.replace(/\D/g, "").slice(0, 7);
      return `${letters}${digits}`.slice(0, 9);
    },
    validate: (value) => (/^[A-Z]{1,2}\d{6,7}$/.test(value) ? null : "Passaporte invalido. Use 1-2 letras e 6-7 numeros."),
  },
  "Carta de Conducao": {
    normalize: (value) => normalizeAlphaNumeric(value, 15),
    validate: (value) =>
      /^[A-Z0-9]{8,15}$/.test(value)
        ? null
        : "Carta de Conducao invalida. Use 8 a 15 caracteres alfanumericos.",
  },
  DIRE: {
    normalize: (value) => {
      const raw = normalizeAlphaNumeric(value, 10);
      const letters = raw.replace(/[0-9]/g, "").slice(0, 2);
      const digits = raw.replace(/\D/g, "").slice(0, 8);
      return `${letters}${digits}`.slice(0, 10);
    },
    validate: (value) => (/^[A-Z]{2}\d{6,8}$/.test(value) ? null : "DIRE invalido. Use 2 letras e 6-8 numeros."),
  },
  "Cartao de Eleitor": {
    normalize: (value) => normalizeDigits(value, 14),
    validate: (value) => (/^\d{8,14}$/.test(value) ? null : "Cartao de Eleitor invalido. Use 8 a 14 numeros."),
  },
  "Cedula Pessoal": {
    normalize: (value) => normalizeAlphaNumeric(value, 14),
    validate: (value) =>
      /^[A-Z0-9]{6,14}$/.test(value) ? null : "Cedula Pessoal invalida. Use 6 a 14 caracteres.",
  },
  "Certidao de Nascimento": {
    normalize: (value) =>
      String(value || "")
        .toUpperCase()
        .replace(/[^0-9A-Z-]/g, "")
        .slice(0, 25),
    validate: (value) =>
      /^[A-Z0-9-]{6,25}$/.test(value)
        ? null
        : "Certidao de Nascimento invalida. Use 6 a 25 caracteres validos.",
  },
  "Documento Militar": {
    normalize: (value) =>
      String(value || "")
        .toUpperCase()
        .replace(/[^0-9A-Z-]/g, "")
        .slice(0, 20),
    validate: (value) =>
      /^[A-Z0-9-]{6,20}$/.test(value)
        ? null
        : "Documento Militar invalido. Use 6 a 20 caracteres validos.",
  },
};

export function normalizeMozNuit(value) {
  return normalizeDigits(value, NUIT_LENGTH);
}

export function validateMozNuit(value, { required = false, label = "NUIT" } = {}) {
  const raw = String(value || "");
  if (!raw) return required ? `${label} e obrigatorio.` : null;
  if (!/^\d{9}$/.test(raw)) return `${label} invalido. Use exatamente 9 digitos.`;
  return null;
}

export function normalizeMozDocumentNumber(value, documentType) {
  const normalizedType = String(documentType || "").trim();
  const rule = DOCUMENT_RULES[normalizedType];
  if (!rule) return normalizeAlphaNumeric(value, 30);
  return rule.normalize(value);
}

export function validateMozDocumentNumber(value, documentType, { required = false, label = "Documento" } = {}) {
  const normalizedType = String(documentType || "").trim();
  const normalizedValue = String(value || "").trim();

  if (!normalizedType && !normalizedValue) {
    return required ? `${label}: tipo e numero sao obrigatorios.` : null;
  }
  if (normalizedType && !normalizedValue) return `${label}: informe o numero.`;
  if (!normalizedType && normalizedValue) return `${label}: selecione o tipo.`;

  if (!MOZAMBIQUE_DOCUMENT_TYPES.has(normalizedType)) {
    return `${label}: tipo de documento invalido.`;
  }

  const rule = DOCUMENT_RULES[normalizedType];
  return rule.validate(normalizedValue);
}
