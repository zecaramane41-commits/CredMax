import { createBrowserRouter } from "react-router";
import { lazyPage } from "./lib/lazy";

// Páginas core que ficam no bundle inicial (necessárias à primeira render)
import LoginPage from "./pages/auth/LoginPage";
import MainLayout from "./layouts/MainLayout";
import RouteRedirectPage from "./pages/shared/RouteRedirectPage";

// Dashboard e Core
const FinancePage = lazyPage(() => import("./pages/finance/FinancePage"));
const DashboardPage = lazyPage(() => import("./pages/dashboard/DashboardPage"));
const ClientsPage = lazyPage(() => import("./pages/clients/ClientsPage"));
const Client360Page = lazyPage(() => import("./pages/clients/Client360Page"));

// Créditos
const CreditsPage = lazyPage(() => import("./pages/credits/CreditsPage"));
const SimulatorPage = lazyPage(() => import("./pages/credits/SimulatorPage"));

// Operações
const ReembolsosPage = lazyPage(() => import("./pages/operations/ReembolsosPage"));
const MoraPage = lazyPage(() => import("./pages/operations/MoraPage"));
const AbatesPage = lazyPage(() => import("./pages/operations/AbatesPage"));
const ExtornosPage = lazyPage(() => import("./pages/operations/ExtornosPage"));
const CapitalizacaoPage = lazyPage(() => import("./pages/operations/CapitalizacaoPage"));
const ReestruturacaoPage = lazyPage(() => import("./pages/operations/ReestruturacaoPage"));

// Central de Risco
const RiskCenterPage = lazyPage(() => import("./pages/risk/RiskCenterPage"));
const RegrasRiscoPage = lazyPage(() => import("./pages/risk/RegrasRiscoPage"));
const ScorePage = lazyPage(() => import("./pages/risk/ScorePage"));
const ExposicaoPage = lazyPage(() => import("./pages/risk/ExposicaoPage"));
const AlertasRiscoPage = lazyPage(() => import("./pages/risk/AlertasRiscoPage"));

// Carteiras
const CarteirasAtivasPage = lazyPage(() => import("./pages/portfolios/CarteirasAtivasPage"));
const SegmentacaoPage = lazyPage(() => import("./pages/portfolios/SegmentacaoPage"));
const TransferenciasPage = lazyPage(() => import("./pages/portfolios/TransferenciasPage"));

// Financeiro
const FluxoCaixaPage = lazyPage(() => import("./pages/finance/FluxoCaixaPage"));
const TesourariaPage = lazyPage(() => import("./pages/finance/TesourariaPage"));
const ContabilidadePage = lazyPage(() => import("./pages/finance/ContabilidadePage"));
const ConciliacaoPage = lazyPage(() => import("./pages/finance/ConciliacaoPage"));

// Relatórios
const CreditosReportPage = lazyPage(() => import("./pages/reports/CreditosReportPage"));
const ClientesReportPage = lazyPage(() => import("./pages/reports/ClientesReportPage"));
const FinanceiroReportPage = lazyPage(() => import("./pages/reports/FinanceiroReportPage"));
const CarteirasReportPage = lazyPage(() => import("./pages/reports/CarteirasReportPage"));
const BancoMocambiqueReportPage = lazyPage(() => import("./pages/reports/BancoMocambiqueReportPage"));
const IndicadoresReportPage = lazyPage(() => import("./pages/reports/IndicadoresReportPage"));

// Notificações
const SmsPage = lazyPage(() => import("./pages/notifications/SmsPage"));
const EmailPage = lazyPage(() => import("./pages/notifications/EmailPage"));
const AlertasNotificacoesPage = lazyPage(() => import("./pages/notifications/AlertasNotificacoesPage"));
const ModelosPage = lazyPage(() => import("./pages/notifications/ModelosPage"));

// Auditoria
const LogsSistemaPage = lazyPage(() => import("./pages/audit/LogsSistemaPage"));
const HistoricoAlteracoesPage = lazyPage(() => import("./pages/audit/HistoricoAlteracoesPage"));
const AcessosPage = lazyPage(() => import("./pages/audit/AcessosPage"));
const EventosCriticosPage = lazyPage(() => import("./pages/audit/EventosCriticosPage"));

// Administração
const AdministrationPage = lazyPage(() => import("./pages/administration/AdministrationPage"));
const UtilizadoresPage = lazyPage(() => import("./pages/administration/UtilizadoresPage"));
const GestoresPage = lazyPage(() => import("./pages/administration/GestoresPage"));
const PerfisPage = lazyPage(() => import("./pages/administration/PerfisPage"));
const PermissoesPage = lazyPage(() => import("./pages/administration/PermissoesPage"));
const DepartamentosPage = lazyPage(() => import("./pages/administration/DepartamentosPage"));
const FormasPagamentoPage = lazyPage(() => import("./pages/administration/FormasPagamentoPage"));

// Parametrização
const ParametrizationPage = lazyPage(() => import("./pages/parametrization/ParametrizationPage"));
const ProdutosCreditoPage = lazyPage(() => import("./pages/parametrization/ProdutosCreditoPage"));
const TaxasPage = lazyPage(() => import("./pages/parametrization/TaxasPage"));
const PenalizacoesPage = lazyPage(() => import("./pages/parametrization/PenalizacoesPage"));
const LimitesPage = lazyPage(() => import("./pages/parametrization/LimitesPage"));
const CalendarioFinanceiroPage = lazyPage(() => import("./pages/parametrization/CalendarioFinanceiroPage"));

// Configurações
const EmpresaPage = lazyPage(() => import("./pages/settings/EmpresaPage"));
const SistemaPage = lazyPage(() => import("./pages/settings/SistemaPage"));
const IntegracoesPage = lazyPage(() => import("./pages/settings/IntegracoesPage"));
const BackupPage = lazyPage(() => import("./pages/settings/BackupPage"));
const SegurancaPage = lazyPage(() => import("./pages/settings/SegurancaPage"));

// Legacy & Auxiliares
const PortfoliosPage = lazyPage(() => import("./pages/portfolios/PortfoliosPage"));
const CashFlowPage = lazyPage(() => import("./pages/treasury/CashFlowPage"));
const AccountingPage = lazyPage(() => import("./pages/accounting/AccountingPage"));
const ReportsPage = lazyPage(() => import("./pages/reports/ReportsPage"));
const AlertsPage = lazyPage(() => import("./pages/reports/AlertsPage"));
const SettingsPage = lazyPage(() => import("./pages/settings/SettingsPage"));
const AdminCompaniesPage = lazyPage(() => import("./pages/admin/AdminCompaniesPage"));
const AdminMicrocreditoPage = lazyPage(() => import("./pages/admin/AdminMicrocreditoPage"));
const CompliancePage = lazyPage(() => import("./pages/compliance/CompliancePage"));

// Central Administrator pages
const AdminDashboardPage = lazyPage(() => import("./pages/admin/AdminDashboardPage"));
const AdminUsersPage = lazyPage(() => import("./pages/admin/AdminUsersPage"));
const AdminSupportPage = lazyPage(() => import("./pages/admin/AdminSupportPage"));
const AdminFinanceiroPage = lazyPage(() => import("./pages/admin/AdminFinanceiroPage"));
const AdminMonitoringPage = lazyPage(() => import("./pages/admin/AdminMonitoringPage"));
const AdminNotificationsPage = lazyPage(() => import("./pages/admin/AdminNotificationsPage"));
const AdminAdminReportsPage = lazyPage(() => import("./pages/admin/AdminAdminReportsPage"));
const AdminAuditPage = lazyPage(() => import("./pages/admin/AdminAuditPage"));
const AdminSecurityPage = lazyPage(() => import("./pages/admin/AdminSecurityPage"));
const AdminSettingsPage = lazyPage(() => import("./pages/admin/AdminSettingsPage"));

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/",
    Component: MainLayout,
    children: [
      { index: true, Component: FinancePage },
      { path: "dashboard", Component: DashboardPage },
      { path: "clients", Component: ClientsPage },
      { path: "clients/:clientId/360", Component: Client360Page },

      // Créditos
      { path: "credits", Component: CreditsPage },
      { path: "credits/simulador", Component: SimulatorPage },
      // Rotas antigas -> redirecionam para a aba correspondente em /credits
      { path: "credits/pedidos", Component: RouteRedirectPage },
      { path: "credits/analise", Component: RouteRedirectPage },
      { path: "credits/aprovacao", Component: RouteRedirectPage },
      { path: "credits/autorizacao", Component: RouteRedirectPage },
      { path: "credits/desembolso", Component: RouteRedirectPage },
      // Reembolsos (Módulo Principal)
      { path: "reembolsos", Component: ReembolsosPage },

      // Operações
      { path: "operations/reembolsos", Component: ReembolsosPage },
      { path: "operations/mora", Component: MoraPage },
      { path: "operations/abates", Component: AbatesPage },
      { path: "operations/extornos", Component: ExtornosPage },
      { path: "operations/capitalizacao", Component: CapitalizacaoPage },
      { path: "operations/reestruturacao", Component: ReestruturacaoPage },

      // Central de Risco
      { path: "risk/consulta", Component: RiskCenterPage },
      { path: "risk/regras", Component: RegrasRiscoPage },
      { path: "risk/score", Component: ScorePage },
      { path: "risk/exposicao", Component: ExposicaoPage },
      { path: "risk/alertas", Component: AlertasRiscoPage },

      // Carteiras
      { path: "portfolios/ativas", Component: CarteirasAtivasPage },
      { path: "portfolios/segmentacao", Component: SegmentacaoPage },
      { path: "portfolios/transferencias", Component: TransferenciasPage },

      // Financeiro
      { path: "finance/fluxo-caixa", Component: FluxoCaixaPage },
      { path: "finance/tesouraria", Component: TesourariaPage },
      { path: "finance/contabilidade", Component: ContabilidadePage },
      { path: "finance/conciliacao", Component: ConciliacaoPage },

      // Relatórios
      { path: "reports/creditos", Component: CreditosReportPage },
      { path: "reports/clientes", Component: ClientesReportPage },
      { path: "reports/financeiro", Component: FinanceiroReportPage },
      { path: "reports/carteiras", Component: CarteirasReportPage },
      { path: "reports/banco-mocambique", Component: BancoMocambiqueReportPage },
      { path: "reports/indicadores", Component: IndicadoresReportPage },

      // Notificações
      { path: "notifications/sms", Component: SmsPage },
      { path: "notifications/email", Component: EmailPage },
      { path: "notifications/alertas", Component: AlertasNotificacoesPage },
      { path: "notifications/modelos", Component: ModelosPage },

      // Auditoria
      { path: "audit/logs", Component: LogsSistemaPage },
      { path: "audit/historico", Component: HistoricoAlteracoesPage },
      { path: "audit/acessos", Component: AcessosPage },
      { path: "audit/eventos", Component: EventosCriticosPage },

      // Administração (Hub com abas lado a lado)
      { path: "administration", Component: AdministrationPage },
      { path: "administration/utilizadores", Component: AdministrationPage },
      { path: "administration/gestores", Component: AdministrationPage },
      { path: "administration/perfis", Component: AdministrationPage },
      { path: "administration/permissoes", Component: AdministrationPage },
      { path: "administration/departamentos", Component: AdministrationPage },
      { path: "administration/formas-pagamento", Component: AdministrationPage },
      { path: "administration/contas", Component: AdministrationPage },

      // Parametrização (Hub com abas lado a lado)
      { path: "parametrization", Component: ParametrizationPage },
      { path: "parametrization/produtos", Component: ParametrizationPage },
      { path: "parametrization/taxas", Component: ParametrizationPage },
      { path: "parametrization/penalizacoes", Component: ParametrizationPage },
      { path: "parametrization/limites", Component: ParametrizationPage },
      { path: "parametrization/calendario", Component: ParametrizationPage },

      // Configurações (Hub com abas lado a lado)
      { path: "settings", Component: SettingsPage },
      { path: "settings/empresa", Component: SettingsPage },
      { path: "settings/sistema", Component: SettingsPage },
      { path: "settings/integracoes", Component: SettingsPage },
      { path: "settings/backup", Component: SettingsPage },
      { path: "settings/seguranca", Component: SettingsPage },

      // Legacy redirects
      { path: "risk-center", Component: RiskCenterPage },
      { path: "portfolios", Component: PortfoliosPage },
      { path: "cash-flow", Component: CashFlowPage },
      { path: "accounting", Component: AccountingPage },
      { path: "reports", Component: ReportsPage },
      { path: "reports/alertas", Component: AlertsPage },
      { path: "reports/reimbursements", Component: RouteRedirectPage },
      { path: "reports/disbursements", Component: RouteRedirectPage },
      { path: "reports/clients", Component: RouteRedirectPage },
      { path: "reports/guia-iva", Component: RouteRedirectPage },
      { path: "settings", Component: SettingsPage },

      { path: "admin-companies", Component: AdminCompaniesPage },
      { path: "admin-microcredito", Component: AdminMicrocreditoPage },
      { path: "compliance", Component: CompliancePage },
      { path: "loans", Component: RouteRedirectPage },
      { path: "simulator", Component: RouteRedirectPage },
      { path: "credit-analysis", Component: RouteRedirectPage },
      { path: "disbursement", Component: RouteRedirectPage },
      { path: "reimbursements", Component: RouteRedirectPage },
      { path: "operations", Component: RouteRedirectPage },

      // Central Administrator routes
      { path: "admin", Component: AdminDashboardPage },
      { path: "admin/users", Component: AdminUsersPage },
      { path: "admin/support", Component: AdminSupportPage },
      { path: "admin/financeiro", Component: AdminFinanceiroPage },
      { path: "admin/monitoring", Component: AdminMonitoringPage },
      { path: "admin/notifications", Component: AdminNotificationsPage },
      { path: "admin/reports", Component: AdminAdminReportsPage },
      { path: "admin/audit", Component: AdminAuditPage },
      { path: "admin/security", Component: AdminSecurityPage },
      { path: "admin/settings", Component: AdminSettingsPage },
    ],
  },
]);