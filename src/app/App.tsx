import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { getActiveCompanyId, getUser, isAuthenticated } from "./lib/auth";
import { Toaster } from "./components/ui/sonner";
import { applySystemFontSize, applySystemTheme } from "./lib/theme";

export default function App() {
  useEffect(() => {
    applySystemFontSize();
    applySystemTheme();
  }, []);

  const pathname = window.location.pathname;
  const isLoginRoute = pathname === "/login";
  // Portal público do cliente (Fase 2.2): acessível sem sessão interna.
  const isPublicPortalRoute = pathname === "/credito" || pathname.startsWith("/credito/");
  const authenticated = isAuthenticated();
  const user = getUser();
  const activeCompanyId = getActiveCompanyId();
  const isCentralAdmin = Boolean(user?.role === "admin" && !user?.companyId);

  if (!isLoginRoute && !isPublicPortalRoute && !authenticated) {
    window.location.href = "/login";
  }

  if (isLoginRoute && authenticated) {
    window.location.href = isCentralAdmin && !activeCompanyId ? "/admin-companies" : "/";
  }

  // Central admin: allow all /admin* and /admin-companies paths; only redirect if on a non-admin page
  if (!isLoginRoute && !isPublicPortalRoute && authenticated && isCentralAdmin && !activeCompanyId && !pathname.startsWith("/admin") && pathname !== "/admin-companies") {
    window.location.href = "/admin-companies";
  }
  
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
