import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { CreditCard, LogOut, User } from "lucide-react";
import { clearPortalAuth, getPortalAccount, isPortalAuthenticated } from "../lib/portal-api";

function navClass(isActive: boolean) {
  return [
    "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
    isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

/**
 * Layout público do Portal do Cliente (Fase 2.2 — §5).
 * Fica FORA do `MainLayout` interno: sem sidebar, sem sessão financeira.
 */
export default function PortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const authenticated = isPortalAuthenticated();
  const account = authenticated ? getPortalAccount() : null;

  const handleLogout = () => {
    clearPortalAuth();
    navigate("/credito");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/credito" className="flex items-center gap-2 text-slate-900">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <CreditCard className="h-5 w-5" />
            </span>
            <span className="font-bold">
              CredMax{" "}
              <span className="font-medium text-slate-500">· Portal do Cliente</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/credito" end className={({ isActive }) => navClass(isActive)}>
              Simulador
            </NavLink>
            <NavLink to="/credito/pedidos" className={({ isActive }) => navClass(isActive)}>
              Os meus pedidos
            </NavLink>
            {account ? (
              <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
                <span className="hidden max-w-[10rem] truncate text-sm text-slate-600 sm:inline">
                  {account.fullName}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                  title="Terminar sessao"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
            ) : (
              <Link
                to="/credito/aceder"
                className={`inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 ${
                  location.pathname === "/credito/aceder" ? "ring-2 ring-indigo-300" : ""
                }`}
              >
                <User className="h-4 w-4" />
                Aceder
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-4 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} CredMax — Portal Público do Cliente</span>
          <span>
            Simulações não vinculativas: os valores finais dependem da análise e aprovação do pedido.
          </span>
        </div>
      </footer>
    </div>
  );
}
