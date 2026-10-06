import { z } from "zod";

const emailField = z
  .string({ required_error: "Email e obrigatorio." })
  .trim()
  .min(1, "Email e obrigatorio.")
  .email("Email invalido.")
  .transform((value) => value.toLowerCase());

const amountField = z.coerce
  .number({ required_error: "Montante e obrigatorio.", invalid_type_error: "Montante invalido." })
  .positive("Montante deve ser maior que zero.");

const periodField = z.coerce
  .number({ required_error: "Prazo e obrigatorio.", invalid_type_error: "Prazo invalido." })
  .int("Prazo deve ser expresso em meses inteiros.")
  .min(1, "Prazo minimo de 1 mes.")
  .max(120, "Prazo maximo de 120 meses.");

const frequencyField = z
  .enum(["diario", "semanal", "quinzenal", "mensal"], {
    required_error: "Frequencia de pagamento obrigatoria.",
    invalid_type_error: "Frequencia de pagamento invalida.",
    errorMap: () => ({ message: "Frequencia de pagamento invalida." }),
  })
  .default("mensal");

const companyIdField = z.coerce
  .number({ required_error: "Empresa obrigatoria.", invalid_type_error: "Empresa obrigatoria." })
  .int("Empresa obrigatoria.")
  .positive("Empresa obrigatoria.");

export const registerSchema = z.object({
  fullName: z
    .string({ required_error: "Nome completo e obrigatorio." })
    .trim()
    .min(3, "Nome completo e obrigatorio.")
    .max(160, "Nome completo demasiado longo."),
  email: emailField,
  phone: z
    .string({ required_error: "Telefone e obrigatorio." })
    .trim()
    .min(9, "Telefone invalido.")
    .max(30, "Telefone invalido."),
  documentNumber: z
    .string({ required_error: "Documento de identificacao e obrigatorio." })
    .trim()
    .min(4, "Documento de identificacao invalido.")
    .max(40, "Documento de identificacao invalido."),
  password: z
    .string({ required_error: "Palavra-passe e obrigatoria." })
    .min(8, "Palavra-passe deve ter pelo menos 8 caracteres."),
  companyId: companyIdField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ required_error: "Palavra-passe e obrigatoria." })
    .min(1, "Palavra-passe e obrigatoria."),
  companyId: companyIdField.optional(),
});

export const simulateSchema = z.object({
  companyId: companyIdField,
  amount: amountField,
  periodMonths: periodField,
  paymentFrequency: frequencyField,
  monthlyRatePercent: z.coerce
    .number({ invalid_type_error: "Taxa invalida." })
    .min(0, "Taxa invalida.")
    .max(100, "Taxa invalida.")
    .optional(),
});

export const applicationSchema = z.object({
  amount: amountField,
  periodMonths: periodField,
  paymentFrequency: frequencyField,
  monthlyRatePercent: z.coerce
    .number({ invalid_type_error: "Taxa invalida." })
    .min(0, "Taxa invalida.")
    .max(100, "Taxa invalida.")
    .optional(),
  purpose: z
    .string()
    .trim()
    .max(200, "Finalidade demasiado longa.")
    .optional()
    .default("Capital de Giro"),
});
