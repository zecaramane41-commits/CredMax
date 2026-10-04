/**
 * Sistema simplificado de toasts
 * Substitui window.confirm e alert por notificações elegantes
 */
import { toast } from "sonner";

export function showSuccess(message: string) {
  toast.success(message, {
    duration: 4000,
    position: "top-right",
  });
}

export function showError(message: string) {
  toast.error(message, {
    duration: 5000,
    position: "top-right",
  });
}

export function showInfo(message: string) {
  toast.info(message, {
    duration: 3000,
    position: "top-right",
  });
}

export function showWarning(message: string) {
  toast.warning(message, {
    duration: 4000,
    position: "top-right",
  });
}

/**
 * Confirmação personalizada (substitui window.confirm)
 * Retorna uma Promise<boolean>
 */
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Usa o confirm nativo como fallback simples
    // Idealmente substituir por um Dialog do Radix
    resolve(window.confirm(message));
  });
}