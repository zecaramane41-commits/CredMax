import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Menu, X, User, LogOut, ChevronDown } from "lucide-react";
import {
  allNavGroups,
  centralAdminNavigation,
  standaloneNavItems,
  type NavGroup,
  type NavItem,
} from "../config/navigation";
import { clearActiveCompanyId, clearAuth, getActiveCompanyId, getUser } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { closeFinanceDay, fetchFinanceSessionState, openFinanceDay, type FinanceSessionState } from "../lib/finance-session";
import { hasPermission } from "../lib/permissions";
import NotificationBell from "../components/notifications/NotificationBell";
import GlobalSearch from "../components/search/GlobalSearch";

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<{ name: string; logoUrl: string; nuit: string } | null>(null);
  const [financeState, setFinanceState] = useState<FinanceSessionState | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [financeError, setFinanceError] = useState("");
  const [financeOpeningBalance, setFinanceOpeningBalance] = useState("0");
  const [financeOpeningCapital, setFinanceOpeningCapital] = useState("0");
  const [financeOpeningReinforcement, setFinanceOpeningReinforcement] = useState("0");
  const user = getUser();
  const activeCompanyId = getActiveCompanyId();
  const isCentralAdmin = Boolean(user?.role === "admin" && !user?.companyId);
  const isCompanyAdmin = Boolean(user?.role === "admin" && user?.companyId);
  const selectedCompanyId = activeCompanyId || (user?.companyId ?? null);
  // Admin central (ex.: admin@microcredito.mz) nao obedece a regra de abertura/fecho do dia financeiro
  const financeSessionRequired = Boolean(selectedCompanyId) && !isCentralAdmin;
  const canReopenFinanceDay = Boolean(
    isCentralAdmin || (isCompanyAdmin && Number(user?.companyId) === Number(selectedCompanyId)),
  );

  const loadFinanceState = async () => {
    if (!financeSessionRequired) {
      setFinanceState(null);
      setFinanceError("");
      return;
    }
    setFinanceLoading(true);
    try {
      const payload = await fetchFinanceSessionState();
      setFinanceState(payload);
      setFinanceError("");
      setFinanceOpeningBalance(String(payload.previousClosingBalance || 0));
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Falha ao carregar sessao financeira.");
    } finally {
      setFinanceLoading(false);
    }
  };

  const handleFinanceLogout = () => {
    clearAuth();
    navigate("/login");
  };

  const handleOpenDay = async () => {
    const reopeningSameDay = Boolean(financeState?.session && financeState.session.status !== "open");
    if (reopeningSameDay && !canReopenFinanceDay) {
      setFinanceError("Reabertura no mesmo dia permitida apenas para Admin da empresa ou Central de Empresas.");
      return;
    }
    let reopenReason = "";
    if (reopeningSameDay) {
      const confirmed = window.confirm(
        "O dia ja foi fechado. Deseja realmente reabrir? Qualquer alteracao feita sera notada neste dia e o fecho sera recalculado com as novas mudancas.",
      );
      if (!confirmed) return;
      reopenReason = String(window.prompt("Informe o motivo da reabertura:") || "").trim();
      if (!reopenReason) {
        setFinanceError("Informe o motivo da reabertura para continuar.");
        return;
      }
    }
    setFinanceBusy(true);
    setFinanceError("");
    try {
      await openFinanceDay({
        openingBalance: Number(financeOpeningBalance || 0),
        openingCapital: Number(financeOpeningCapital || 0),
        reinforcement: Number(financeOpeningReinforcement || 0),
        confirmReopen: reopeningSameDay,
        reopenReason: reopeningSameDay ? reopenReason : undefined,
        notesOpen: reopeningSameDay ? reopenReason : undefined,
      });
      window.location.reload();
      return;
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Falha ao abrir dia financeiro.");
    } finally {
      setFinanceBusy(false);
    }
  };

  const handleCloseDayAndLogout = async () => {
    setFinanceBusy(true);
    setFinanceError("");
    try {
      await closeFinanceDay({});
      clearAuth();
      navigate("/login");
    } catch (error) {
      setFinanceError(error instanceof Error ? error.message : "Falha ao fechar o dia.");
      setFinanceBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyProfile(null);
      return;
    }
    let ignore = false;
    apiFetch<{ company: { name: string; logoUrl?: string; nuit?: string } }>("/company/profile")
      .then((data) => {
        if (ignore) return;
        setCompanyProfile({
          name: data.company.name,
          logoUrl: data.company.logoUrl || "",
          nuit: data.company.nuit || "",
        });
        localStorage.setItem(
          "microcredit_company_profile",
          JSON.stringify({
            name: data.company.name || "",
            legalName: "",
            nuit: data.company.nuit || "",
            logoUrl: data.company.logoUrl || "",
          }),
        );
      })
      .catch(() => {
        if (ignore) return;
        setCompanyProfile(null);
        localStorage.removeItem("microcredit_company_profile");
      });
    return () => {
      ignore = true;
    };
  }, [selectedCompanyId]);

  useEffect(() => {
    let ignore = false;
    if (!financeSessionRequired) {
      setFinanceState(null);
      setFinanceError("");
      return undefined;
    }

    const sync = async () => {
      if (ignore) return;
      await loadFinanceState();
    };

    void sync();
    const timer = window.setInterval(() => {
      void sync();
    }, 60000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [financeSessionRequired, selectedCompanyId]);

  // Auto-expand the group that contains the current route and collapse all others
  useEffect(() => {
    const basePath = location.pathname;
    const matchedGroup = allNavGroups.find((group) =>
      group.items.some((item) => item.path.split("?")[0] === basePath),
    );
    if (matchedGroup) {
      setExpandedGroups(new Set([matchedGroup.id]));
    } else {
      setExpandedGroups(new Set());
    }
  }, [location.pathname]);

  const filterNavItems = useCallback(
    (items: NavItem[]) => items.filter((item) => !item.permission || hasPermission(user, item.permission)),
    [user],
  );

  const filterNavGroup = useCallback(
    (group: NavGroup) => {
      const items = filterNavItems(group.items);
      return items.length ? { ...group, items } : null;
    },
    [filterNavItems],
  );

  const accessibleStandalone = useMemo(() => filterNavItems(standaloneNavItems), [filterNavItems]);

  const accessibleGroups = useMemo(() => {
    return allNavGroups
      .map((group) => filterNavGroup(group))
      .filter((g): g is NavGroup => g !== null);
  }, [filterNavGroup]);

  const centralAdminNavItems = useMemo(() => filterNavItems(centralAdminNavigation), [filterNavItems]);

  const allAccessiblePaths = useMemo(() => {
    if (isCentralAdmin && !activeCompanyId) {
      return centralAdminNavItems.map((item) => item.path);
    }
    const paths: string[] = [];
    paths.push(...accessibleStandalone.map((item) => item.path));
    for (const group of accessibleGroups) {
      for (const item of group.items) {
        paths.push(item.path);
      }
    }
    return paths;
  }, [accessibleGroups, accessibleStandalone, centralAdminNavItems, isCentralAdmin, activeCompanyId]);

  useEffect(() => {
    if (!allAccessiblePaths.length) return;
    // Admin central sem empresa ativa: qualquer rota fora da area admin vai para a Central de Empresas
    if (isCentralAdmin && !activeCompanyId) {
      const isAdminArea = location.pathname.startsWith("/admin") || location.pathname === "/admin-companies";
      if (!isAdminArea) {
        navigate("/admin-companies", { replace: true });
      }
      return;
    }
    const exactMatch = allAccessiblePaths.some((p) => p.split("?")[0] === location.pathname);
    if (!exactMatch) {
      navigate(allAccessiblePaths[0], { replace: true });
    }
  }, [allAccessiblePaths, location.pathname, navigate, isCentralAdmin, activeCompanyId]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const renderNavGroup = (group: NavGroup) => {
    const GroupIcon = group.icon;
    const isExpanded = expandedGroups.has(group.id);
    const visibleItems = group.items;
    if (!visibleItems.length) return null;

    // Grupo com um único item: link directo (sem submenu)
    if (visibleItems.length === 1) {
      const only = visibleItems[0];
      const OnlyIcon = group.icon;
      const isActiveOnly = only.path.split("?")[0] === location.pathname || location.pathname.startsWith(`${only.path.split("?")[0]}/`);
      return (
        <div key={group.id} className="mb-0.5">
          <Link
            to={only.path}
            onClick={() => {
              setSidebarOpen(false);
              toggleGroup(group.id);
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
              transition-all duration-200
              ${isActiveOnly ? "bg-indigo-500/20 text-indigo-200 shadow-sm" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"}
            `}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 ${isActiveOnly ? "bg-indigo-500/30" : "bg-slate-800/50"}`}>
              <OnlyIcon className={`w-4 h-4 ${isActiveOnly ? "text-indigo-300" : "text-slate-400"}`} />
            </div>
            <span className={`${sidebarCollapsed ? "hidden" : "text-sm font-medium truncate"}`}>{group.name}</span>
          </Link>
        </div>
      );
    }

    const isAnyActive = visibleItems.some((item) => item.path.split("?")[0] === location.pathname);

    return (
      <div key={group.id} className="mb-0.5">
        <button
          onClick={() => toggleGroup(group.id)}
          className={`
            w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl
            transition-all duration-200 group/btn
            ${
              isAnyActive
                ? "bg-indigo-500/20 text-indigo-200 shadow-sm"
                : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
            }
          `}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`
              w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
              transition-all duration-200
              ${isAnyActive ? "bg-indigo-500/30" : "bg-slate-800/50 group-hover/btn:bg-slate-700/50"}
            `}>
              <GroupIcon className={`w-4 h-4 ${isAnyActive ? "text-indigo-300" : "text-slate-400"}`} />
            </div>
            <span className={`${sidebarCollapsed ? "hidden" : "text-sm font-medium truncate"}`}>{group.name}</span>
          </div>
          <ChevronDown className={`
            w-3.5 h-3.5 text-slate-500 transition-all duration-200 flex-shrink-0
            ${isExpanded ? "rotate-180" : ""}
            ${sidebarCollapsed ? "hidden" : ""}
          `} />
        </button>
        {isExpanded && !sidebarCollapsed && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700/50 pl-2">
            {visibleItems.map((sub) => {
              const isActiveSub = sub.path.split("?")[0] === location.pathname;
              const SubIcon = sub.icon;
              return (
                <Link
                  key={sub.path}
                  to={sub.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    group flex items-center gap-2.5 px-3 py-2 rounded-lg
                    transition-all duration-150 text-xs
                    ${
                      isActiveSub
                        ? "bg-indigo-500/15 text-indigo-200 font-medium"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    }
                  `}
                >
                  <SubIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isActiveSub ? "text-indigo-300" : "text-slate-500"}`} />
                  <span className="truncate">{sub.name}</span>
                  {isActiveSub && <div className="w-1 h-1 rounded-full bg-indigo-400 ml-auto flex-shrink-0" />}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  const handleBackToAdmin = () => {
    clearActiveCompanyId();
    navigate("/admin-companies");
  };

  const financeLockActive = financeSessionRequired && ((!financeState && financeLoading) || Boolean(financeState?.systemLocked));
  const financeSessionOpen = financeState?.session?.status === "open";
  const reopeningSameDay = Boolean(financeState?.session && financeState.session.status !== "open");
  const canOpenFinanceDay = !reopeningSameDay || canReopenFinanceDay;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {/* Mobile menu toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
              </button>
              {/* Desktop collapse toggle */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:inline-flex p-2 rounded-xl hover:bg-slate-100 transition-colors"
                aria-label="Toggle sidebar width"
              >
                <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${sidebarCollapsed ? "rotate-90" : "-rotate-90"}`} />
              </button>
              {/* Logo + Company name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
                  {companyProfile?.logoUrl ? (
                    <img src={companyProfile.logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <CreditCard className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
                    {companyProfile?.name || (isCentralAdmin && !activeCompanyId ? "Central de Empresas" : "SiGeM")}
                  </h1>
                  <p className="text-[11px] text-slate-500 hidden sm:block leading-tight">
                    {companyProfile?.nuit
                      ? `NUIT: ${companyProfile.nuit}`
                      : isCentralAdmin && !activeCompanyId
                        ? "Administração Central — Gestão de Empresas"
                        : "Sistema de Microcrédito"}
                  </p>
                </div>
              </div>
            </div>

            {/* Global search + right side */}
            <div className="flex min-w-0 items-center gap-2">
              <GlobalSearch />
              <NotificationBell />
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-sm">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 hidden sm:block">{user?.fullName || "Admin"}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-900">{user?.fullName || "Administrador"}</p>
                      <p className="text-xs text-slate-500">{user?.email || "-"}</p>
                    </div>
                    {isCentralAdmin && activeCompanyId && (
                      <button
                        onClick={handleBackToAdmin}
                        className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        Voltar para Central de Empresas
                      </button>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Terminar Sessão
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="lg:flex lg:gap-0 h-[calc(100vh-4rem)] overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
            ${sidebarOpen ? "fixed z-40 inset-0 left-0 top-16 w-72 h-[calc(100vh-4rem)]" : "lg:static"}
            ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"}
            bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800
            transform transition-all duration-300 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            flex-shrink-0 flex flex-col overflow-hidden
            shadow-xl shadow-slate-900/10
          `}
        >
          {/* Scrollable nav */}
          <nav className="px-2.5 py-4 space-y-0.5 overflow-y-auto flex-1 flex flex-col scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {isCentralAdmin && !activeCompanyId ? (
              /* Central Administrator sidebar */
              <div className="space-y-0.5">
                {centralAdminNavItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        group flex items-center gap-3 px-3 py-2.5 rounded-xl
                        transition-all duration-200
                        ${isActive
                          ? "bg-indigo-500/20 text-indigo-200 shadow-sm"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                        }
                      `}
                    >
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                        transition-all duration-200
                        ${isActive ? "bg-indigo-500/30" : "bg-slate-800/50 group-hover:bg-slate-700/50"}
                      `}>
                        <Icon className={`w-4 h-4 ${isActive ? "text-indigo-300" : "text-slate-400"}`} />
                      </div>
                      <span className={`${sidebarCollapsed ? "hidden" : "text-sm font-medium truncate"}`}>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              /* Company user sidebar — standalone items first, then groups */
              <>
                {accessibleStandalone.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        group flex items-center gap-3 px-3 py-2.5 rounded-xl
                        transition-all duration-200 mb-0.5
                        ${isActive
                          ? "bg-indigo-500/20 text-indigo-200 shadow-sm"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                        }
                      `}
                    >
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                        transition-all duration-200
                        ${isActive ? "bg-indigo-500/30" : "bg-slate-800/50 group-hover:bg-slate-700/50"}
                      `}>
                        <Icon className={`w-4 h-4 ${isActive ? "text-indigo-300" : "text-slate-400"}`} />
                      </div>
                      <span className={`${sidebarCollapsed ? "hidden" : "text-sm font-medium truncate"}`}>{item.name}</span>
                    </Link>
                  );
                })}
                {accessibleGroups.map(renderNavGroup)}
              </>
            )}
          </nav>

          {/* Sidebar footer */}
          <div className="px-3 py-3 border-t border-slate-700/50 bg-slate-900/50">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span className="text-xs font-medium">Sistema Ativo</span>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto bg-slate-50/80">
          <div className="mx-auto px-4 sm:px-6 lg:px-10 py-6 h-full flex flex-col">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 lg:p-8 flex-1 overflow-auto">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-sm lg:hidden top-16"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Finance lock modal */}
      {financeLockActive && (
        <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Sessão Financeira Obrigatória</h2>
              <p className="text-sm text-slate-500 mt-1">
                Para iniciar o sistema, abra o dia financeiro. Se optar por sair, a sessão será encerrada.
              </p>
            </div>
            {financeError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{financeError}</p>
            )}
            {!financeState && financeLoading && (
              <p className="text-sm text-slate-500">A carregar estado financeiro do dia...</p>
            )}
            {financeState && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500 text-xs">Data Operacional</p>
                    <p className="font-semibold text-slate-900">{financeState.businessDate}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500 text-xs">Saldo Anterior</p>
                    <p className="font-semibold text-slate-900">{financeState.previousClosingBalance.toLocaleString("pt-PT")} MT</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-slate-500 text-xs">Sessão</p>
                    <p className="font-semibold text-slate-900">{financeSessionOpen ? "Aberta" : "Fechada"}</p>
                  </div>
                </div>
                {!financeSessionOpen ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Saldo de Abertura</label>
                      <input className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm bg-slate-50" type="number" step="0.01" value={financeOpeningBalance} readOnly />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Capital Inicial</label>
                      <input className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" type="number" step="0.01" value={financeOpeningCapital} onChange={(e) => setFinanceOpeningCapital(e.target.value)} disabled={!canOpenFinanceDay} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Reforço</label>
                      <input className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" type="number" step="0.01" value={financeOpeningReinforcement} onChange={(e) => setFinanceOpeningReinforcement(e.target.value)} disabled={!canOpenFinanceDay} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    O dia financeiro já está aberto. Feche o dia para encerrar a sessão.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!financeSessionOpen ? (
                    canOpenFinanceDay ? (
                      <button type="button" onClick={handleOpenDay} disabled={financeBusy || financeLoading}
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
                      >
                        Abrir Dia Financeiro
                      </button>
                    ) : (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Reabertura disponível apenas para Admin.
                      </p>
                    )
                  ) : (
                    <button type="button" onClick={handleCloseDayAndLogout} disabled={financeBusy || financeLoading}
                      className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 shadow-sm"
                    >
                      Fechar Dia e Sair
                    </button>
                  )}
                  <button type="button" onClick={handleFinanceLogout}
                    className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Sair do Sistema
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}