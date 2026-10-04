const DEFAULT_PASSWORD_POLICY = {
  minLength: 8,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSpecial: true,
  expiryDays: 90,
};

export function normalizePasswordPolicy(policy = {}) {
  const minLength = Number(policy.minLength);
  const expiryDays = Number(policy.expiryDays);
  return {
    minLength: Number.isInteger(minLength) && minLength >= 6 && minLength <= 64 ? minLength : DEFAULT_PASSWORD_POLICY.minLength,
    requireUpper: policy.requireUpper !== false,
    requireLower: policy.requireLower !== false,
    requireNumber: policy.requireNumber !== false,
    requireSpecial: policy.requireSpecial !== false,
    expiryDays: Number.isInteger(expiryDays) && expiryDays >= 0 && expiryDays <= 3650 ? expiryDays : DEFAULT_PASSWORD_POLICY.expiryDays,
  };
}

export function validatePasswordAgainstPolicy(password, rawPolicy = {}) {
  const policy = normalizePasswordPolicy(rawPolicy);
  const errors = [];
  const value = String(password || "");

  if (value.length < policy.minLength) {
    errors.push(`A senha deve ter pelo menos ${policy.minLength} caracteres.`);
  }
  if (policy.requireUpper && !/[A-Z]/.test(value)) {
    errors.push("A senha deve conter ao menos uma letra maiuscula.");
  }
  if (policy.requireLower && !/[a-z]/.test(value)) {
    errors.push("A senha deve conter ao menos uma letra minuscula.");
  }
  if (policy.requireNumber && !/[0-9]/.test(value)) {
    errors.push("A senha deve conter ao menos um numero.");
  }
  if (policy.requireSpecial && !/[ !"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(value)) {
    errors.push("A senha deve conter ao menos um caractere especial.");
  }

  return {
    valid: errors.length === 0,
    errors,
    policy,
  };
}
