import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email e obrigatorio." })
    .trim()
    .min(1, "Email e obrigatorio.")
    .email("Email invalido.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ required_error: "Palavra-passe e obrigatoria." })
    .min(1, "Palavra-passe e obrigatoria."),
  mfaCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Codigo MFA deve ter 6 digitos.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Palavra-passe atual e obrigatoria."),
  newPassword: z.string().min(8, "Nova palavra-passe deve ter pelo menos 8 caracteres."),
});
