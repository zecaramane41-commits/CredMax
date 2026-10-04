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

  const isLoginRoute = window.location.pathname === "/login";
  const authenticated = isAuthenticated();
  const user = getUser();
  const activeCompanyId = getActiveCompanyId();
  const isCentralAdmin = Boolean(user?.role === "admin" && !user?.companyId);

  if (!isLoginRoute && !authenticated) {
    window.location.href = "/login";
  }

  if (isLoginRoute && authenticated) {
    window.location.href = isCentralAdmin && !activeCompanyId ? "/admin-companies" : "/";
  }

  // Central admin: allow all /admin* and /admin-companies paths; only redirect if on a non-admin page
  if (!isLoginRoute && authenticated && isCentralAdmin && !activeCompanyId && !window.location.pathname.startsWith("/admin") && window.location.pathname !== "/admin-companies") {
    window.location.href = "/admin-companies";
  }
  
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
