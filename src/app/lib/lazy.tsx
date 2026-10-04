import { ComponentType, Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

export function PageFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 min-h-[50vh] text-slate-500">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <p className="text-sm">A carregar módulo...</p>
    </div>
  );
}

type Factory = () => Promise<{ default: ComponentType<object> }>;

/**
 * Code splitting helper (Fase 6.1). Cada rota carrega o seu bundle sob demanda
 * via React.lazy + Suspense, reduzindo drasticamente a carga inicial.
 *
 * Devolve um componente de função que envolve o lazy num <Suspense> próprio,
 * permitindo usar directamente em `Component: X` (react-router) sem alterar
 * o array de rotas.
 */
export function lazyPage(factory: Factory): ComponentType<object> {
  const LazyComponent = lazy(factory);
  function LazyRoute(props: object) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LazyComponent {...(props as Record<string, unknown>)} />
      </Suspense>
    );
  }
  LazyRoute.displayName = "LazyRoute";
  return LazyRoute;
}