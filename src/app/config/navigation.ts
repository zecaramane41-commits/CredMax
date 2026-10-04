import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUpDown,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calculator,
  Calendar,
  CheckCircle,
  CheckSquare,
  CreditCard,
  FileText,
  Gauge,
  HardDrive,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  Link,
  Lock,
  LogIn,
  Mail,
  MessageSquare,
  Package,
  Percent,
  PieChart,
  RefreshCcw,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";

export type NavItem = {
  name: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
};

export type NavGroup = {
  id: string;
  name: string;
  icon: LucideIcon;
  items: NavItem[];
};

/** Standalone items rendered as direct links (no submenu) */
export const standaloneNavItems: NavItem[] = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { name: "Simulador", path: "/credits/simulador", icon: Calculator, permission: "solicitar.credito" },
  { name: "Clientes", path: "/clients", icon: Users, permission: "clients.view" },
  { name: "Crédito", path: "/credits", icon: CreditCard, permission: "solicitar.credito" },
  { name: "Reembolsos", path: "/reembolsos", icon: Banknote, permission: "registrar.pagamento" },
];

/**
 * Main sidebar navigation — all sections are collapsible groups.
 * Order: Dashboard → Simulador → Clientes → Crédito → Reembolsos → Operações → Central de Risco →
 * Carteiras → Financeiro → Relatórios → Notificações → Auditoria ->
 * Administração → Parametrização → Configurações
 */
export const allNavGroups: NavGroup[] = [
  // Operações
  {
    id: "operations",
    name: "Operações",
    icon: RefreshCcw,
    items: [
      { name: "Abates", path: "/operations/abates", icon: ArrowDown, permission: "registrar.pagamento" },
      { name: "Extornos", path: "/operations/extornos", icon: RotateCcw, permission: "executar.extorno" },
      { name: "Capitalização", path: "/operations/capitalizacao", icon: RefreshCcw, permission: "registrar.pagamento" },
    ],
  },
  // Central de Risco
  {
    id: "risk",
    name: "Central de Risco",
    icon: Shield,
    items: [
      { name: "Consulta de Risco", path: "/risk/consulta", icon: ShieldCheck, permission: "consultar.risco" },
      { name: "Regras de Risco", path: "/risk/regras", icon: ScrollText, permission: "gerir.regras.risco" },
      { name: "Score", path: "/risk/score", icon: TrendingUp, permission: "consultar.risco" },
      { name: "Exposição", path: "/risk/exposicao", icon: Gauge, permission: "consultar.risco" },
      { name: "Alertas", path: "/risk/alertas", icon: Bell, permission: "consultar.risco" },
    ],
  },
  // Carteiras
  {
    id: "portfolios",
    name: "Carteiras",
    icon: Layers,
    items: [
      { name: "Carteiras", path: "/portfolios", icon: Layers, permission: "visualizar.carteiras" },
    ],
  },
  // Financeiro
  {
    id: "finance",
    name: "Financeiro",
    icon: Landmark,
    items: [
      { name: "Fluxo de Caixa", path: "/finance/fluxo-caixa", icon: ArrowUpDown, permission: "visualizar.financeiro" },
      { name: "Tesouraria", path: "/finance/tesouraria", icon: Wallet, permission: "visualizar.financeiro" },
      { name: "Contabilidade", path: "/finance/contabilidade", icon: BookOpen, permission: "visualizar.financeiro" },
      { name: "Conciliação", path: "/finance/conciliacao", icon: CheckCircle, permission: "conciliar.operacoes" },
    ],
  },
  // Relatórios
  {
    id: "reports",
    name: "Relatórios",
    icon: BarChart3,
    items: [
      { name: "Créditos", path: "/reports/creditos", icon: CreditCard, permission: "visualizar.relatorios" },
      { name: "Clientes", path: "/reports/clientes", icon: Users, permission: "visualizar.relatorios" },
      { name: "Financeiro", path: "/reports/financeiro", icon: Landmark, permission: "visualizar.relatorios" },
      { name: "Carteiras", path: "/reports/carteiras", icon: Layers, permission: "visualizar.relatorios" },
      { name: "Banco de Moçambique", path: "/reports/banco-mocambique", icon: Building2, permission: "visualizar.relatorios" },
      { name: "Indicadores", path: "/reports/indicadores", icon: BarChart3, permission: "visualizar.relatorios" },
    ],
  },
  // Notificações
  {
    id: "notifications",
    name: "Notificações",
    icon: Bell,
    items: [
      { name: "SMS", path: "/notifications/sms", icon: MessageSquare, permission: "enviar.notificacoes" },
      { name: "Email", path: "/notifications/email", icon: Mail, permission: "enviar.notificacoes" },
      { name: "Alertas", path: "/notifications/alertas", icon: Bell, permission: "enviar.notificacoes" },
      { name: "Modelos", path: "/notifications/modelos", icon: FileText, permission: "gerir.modelos" },
    ],
  },
  // Auditoria
  {
    id: "audit",
    name: "Auditoria",
    icon: ScrollText,
    items: [
      { name: "Logs do Sistema", path: "/audit/logs", icon: ScrollText, permission: "consultar.auditoria" },
      { name: "Histórico de Alterações", path: "/audit/historico", icon: History, permission: "consultar.auditoria" },
      { name: "Acessos", path: "/audit/acessos", icon: LogIn, permission: "consultar.auditoria" },
      { name: "Eventos Críticos", path: "/audit/eventos", icon: Shield, permission: "consultar.auditoria" },
    ],
  },
  // Administração
  {
    id: "administration",
    name: "Administração",
    icon: Building2,
    items: [
      { name: "Administração", path: "/administration", icon: Building2, permission: "criar.usuarios" },
    ],
  },
  // Parametrização
  {
    id: "parametrization",
    name: "Parametrização",
    icon: SlidersHorizontal,
    items: [
      { name: "Parametrização", path: "/parametrization", icon: SlidersHorizontal, permission: "alterar.parametros.negocio" },
    ],
  },
  // Configurações
  {
    id: "settings",
    name: "Configurações",
    icon: Settings,
    items: [
      { name: "Configurações", path: "/settings", icon: Settings, permission: "alterar.configuracoes.sistema" },
    ],
  },
];

/**
 * Central Administrator navigation items (sidebar for central admin).
 * Order: Empresas (hub principal) → Dashboard → Assinaturas → … → Configurações
 */
export const centralAdminNavigation: NavItem[] = [
  { name: "Central de Empresas", path: "/admin-companies", icon: Building2, permission: "admin_companies.view" },
  { name: "Dashboard", path: "/admin", icon: LayoutDashboard, permission: "admin_dashboard.view" },
  { name: "Assinaturas", path: "/admin-microcredito", icon: CreditCard, permission: "admin_companies.view" },
  { name: "Usuários do Sistema", path: "/admin/users", icon: Users, permission: "admin_users.view" },
  { name: "Suporte", path: "/admin/support", icon: MessageSquare, permission: "admin_support.view" },
  { name: "Financeiro da Plataforma", path: "/admin/financeiro", icon: Landmark, permission: "admin_financeiro.view" },
  { name: "Monitoramento", path: "/admin/monitoring", icon: BarChart3, permission: "admin_monitoring.view" },
  { name: "Notificações", path: "/admin/notifications", icon: Bell, permission: "admin_notifications.view" },
  { name: "Relatórios", path: "/admin/reports", icon: FileText, permission: "admin_reports.view" },
  { name: "Auditoria", path: "/admin/audit", icon: ScrollText, permission: "admin_audit.view" },
  { name: "Segurança", path: "/admin/security", icon: Shield, permission: "admin_security.view" },
  { name: "Configurações", path: "/admin/settings", icon: Settings, permission: "settings.view" },
];