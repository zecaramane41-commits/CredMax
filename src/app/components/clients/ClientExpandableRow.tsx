import { useCallback, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Printer,
  Loader2,
  Banknote,
  Calendar,
  TrendingUp,
  TrendingDown,
  MessageSquare,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { fetchClientCreditProfile, type ClientCreditProfile } from "../../lib/notifications";
import { formatCurrencyMT } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";

type Client = {
  id: number;
  name: string;
  type: "singular" | "grupo" | "empresa";
  nuit: string;
  phone: string;
  email: string;
  status: string;
  score: number;
  loans: number;
  debt: number;
};

type Props = {
  client: Client;
  isExpanded: boolean;
  onToggle: (clientId: number) => void;
};

function creditStateSymbols(profile: ClientCreditProfile) {
  const parts: Array<{ icon: React.ReactNode; label: string; color: string }> = [];
  const summary = profile.summary;

  if (summary.activeLoans > 0) {
    parts.push({
      icon: <Banknote className="w-3.5 h-3.5" />,
      label: `${summary.activeLoans} activo(s)`,
      color: "text-blue-600",
    });
  } else {
    parts.push({
      icon: <XCircle className="w-3.5 h-3.5" />,
      label: "Sem crédito activo",
      color: "text-slate-400",
    });
  }

  if (summary.overdueInstallments > 0) {
    parts.push({
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      label: `${summary.overdueInstallments} em atraso`,
      color: "text-red-500",
    });
  }

  if (summary.nextDueDate) {
    parts.push({
      icon: <Calendar className="w-3.5 h-3.5" />,
      label: `Próx. ${new Date(summary.nextDueDate).toLocaleDateString("pt-MZ")}`,
      color: "text-indigo-500",
    });
  }

  return parts;
}

function statusProfileBadge(status: string) {
  if (status === "late" || status === "overdue") return "bg-red-100 text-red-800 border-red-200";
  if (status === "partial") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "paid" || status === "closed") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-slate-100 text-slate-700";
}

export default function ClientExpandableRow({ client, isExpanded, onToggle }: Props) {
  const [modalClient, setModalClient] = useState<{ id: number; name: string } | null>(null);
  const [modalProfile, setModalProfile] = useState<ClientCreditProfile | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTab, setModalTab] = useState<string>("all");

  const openCreditModal = useCallback(async (clientId: number, clientName: string) => {
    setModalClient({ id: clientId, name: clientName });
    setModalLoading(true);
    setModalProfile(null);
    try {
      const profile = await fetchClientCreditProfile(clientId);
      setModalProfile(profile);
    } catch {
      setModalProfile(null);
    } finally {
      setModalLoading(false);
    }
  }, []);

  const handlePrintCreditState = useCallback(() => {
    if (!modalProfile) return;
    const profile = modalProfile;
    const now = new Date().toLocaleString("pt-PT");
    const activeLoansHtml = profile.loans
      .filter((l) => l.status !== "closed" && l.status !== "paid")
      .map(
        (l) =>
          `<tr>
            <td>${l.contractNo}</td>
            <td>${l.product}</td>
            <td>${formatCurrencyMT(l.principal)}</td>
            <td>${formatCurrencyMT(l.balance)}</td>
            <td>${l.status}</td>
            <td>${l.daysOverdue > 0 ? `${l.daysOverdue} dias` : "-"}</td>
          </tr>`,
      )
      .join("");
    const paidLoansHtml = profile.loans
      .filter((l) => l.status === "closed" || l.status === "paid")
      .map(
        (l) =>
          `<tr>
            <td>${l.contractNo}</td>
            <td>${l.product}</td>
            <td>${formatCurrencyMT(l.principal)}</td>
            <td>${formatCurrencyMT(l.balance)}</td>
            <td>${l.status}</td>
          </tr>`,
      )
      .join("");

    const html = `
      <div class="kpis">
        <div class="kpi"><p>Saldo em dívida</p><h3>${formatCurrencyMT(profile.summary.totalDebt)}</h3></div>
        <div class="kpi"><p>Total pago</p><h3>${formatCurrencyMT(profile.summary.totalPaid)}</h3></div>
        <div class="kpi"><p>Contratos activos</p><h3>${profile.summary.activeLoans}</h3></div>
        <div class="kpi"><p>Prestações em atraso</p><h3>${profile.summary.overdueInstallments}</h3></div>
      </div>
      <h2 class="title">Créditos Activos</h2>
      <table><thead><tr><th>Contrato</th><th>Produto</th><th>Principal</th><th>Saldo</th><th>Status</th><th>Atraso</th></tr></thead>
      <tbody>${activeLoansHtml || "<tr><td colspan='6'>Nenhum crédito activo.</td></tr>"}</tbody></table>
      <h2 class="title" style="margin-top:16px">Créditos Pagos</h2>
      <table><thead><tr><th>Contrato</th><th>Produto</th><th>Principal</th><th>Saldo</th><th>Status</th></tr></thead>
      <tbody>${paidLoansHtml || "<tr><td colspan='5'>Nenhum crédito pago.</td></tr>"}</tbody></table>
      <p class="sub" style="margin-top:12px">Gerado em ${now} | ${profile.client.name}</p>
    `;
    openCorporatePrintWindow({
      title: `Estado de Crédito - ${profile.client.name}`,
      bodyHtml: html,
      browserControls: true,
      landscape: false,
    });
  }, [modalProfile]);

  const allLoans = modalProfile?.loans || [];
  const activeLoans = allLoans.filter((l) => l.status !== "closed" && l.status !== "paid");
  const paidLoans = allLoans.filter((l) => l.status === "closed" || l.status === "paid");
  const displayLoans = modalTab === "active" ? activeLoans : modalTab === "paid" ? paidLoans : allLoans;
  const profile = clientCreditProfiles[client.id]; // This will be accessed from parent

  // Not accessible directly - we need to get data from parent
  const [localProfile, setLocalProfile] = useState<ClientCreditProfile | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  // Load profile when expanded
  useCallback(async () => {
    if (isExpanded && !localProfile && !localLoading) {
      setLocalLoading(true);
      try {
        const p = await fetchClientCreditProfile(client.id);
        setLocalProfile(p);
      } catch {
        // Silently fail
      } finally {
        setLocalLoading(false);
      }
    }
  }, [isExpanded, client.id, localProfile, localLoading]);

  return (
    <>
      <TableRow key={client.id}>
        <TableCell>
          <Button size="sm" variant="ghost" onClick={() => onToggle(client.id)} className="p-1">
            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">{client.name}</TableCell>
        <TableCell className="font-mono text-sm">{client.nuit}</TableCell>
        <TableCell className="text-sm">{client.phone}</TableCell>
        <TableCell>{client.email || "-"}</TableCell>
        <TableCell>{client.city || "-"}</TableCell>
        <TableCell className="text-sm">{client.score}</TableCell>
        <TableCell>{getStatusBadge(client.status)}</TableCell>
        <TableCell>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" title="Detalhes de crédito" onClick={() => openCreditModal(client.id, client.name)}>
              <Eye className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleEditClient(client)}><Edit className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteClient(client.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow key={`${client.id}-expanded`}>
          <TableCell colSpan={10} className="bg-slate-50 p-4">
            {localLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                A carregar perfil de crédito...
              </div>
            ) : localProfile ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  {creditStateSymbols(localProfile).map((part, i) => (
                    <div key={i} className={`flex items-center gap-1 text-xs ${part.color}`}>
                      {part.icon}
                      <span>{part.label}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-xs text-slate-500">Saldo em dívida</p>
                    <p className="text-sm font-bold text-red-700">{formatCurrencyMT(localProfile.summary.totalDebt)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                    <p className="text-xs text-emerald-700">Total pago</p>
                    <p className="text-sm font-bold text-emerald-900">{formatCurrencyMT(localProfile.summary.totalPaid)}</p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
                    <p className="text-xs text-blue-700">Créditos activos</p>
                    <p className="text-sm font-bold text-blue-900">{localProfile.summary.activeLoans}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                    <p className="text-xs text-amber-700">Prest. em atraso</p>
                    <p className="text-sm font-bold text-amber-900">{localProfile.summary.overdueInstallments}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openCreditModal(client.id, client.name)}>
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Ver todos os créditos
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setModalClient({ id: client.id, name: client.name });
                    setModalProfile(localProfile);
                    setTimeout(() => handlePrintCreditState(), 100);
                  }}>
                    <Printer className="w-3.5 h-3.5 mr-1" />
                    Imprimir estado
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Perfil de crédito não disponível.</p>
            )}
          </TableCell>
        </TableRow>
      )}

      {/* Credit Modal */}
      <Dialog open={Boolean(modalClient)} onOpenChange={(open) => { if (!open) setModalClient(null); }}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              Créditos — {modalClient?.name || "Cliente"}
            </DialogTitle>
            <DialogDescription>
              Todos os créditos do cliente: activos, pagos, e estado actual.
            </DialogDescription>
          </DialogHeader>

          {modalLoading && (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              A carregar...
            </div>
          )}

          {modalProfile && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saldo em dívida</p>
                  <p className="text-lg font-bold text-red-700">{formatCurrencyMT(modalProfile.summary.totalDebt)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-700 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Total pago</p>
                  <p className="text-lg font-bold text-emerald-900">{formatCurrencyMT(modalProfile.summary.totalPaid)}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs text-blue-700">Créditos activos</p>
                  <p className="text-lg font-bold text-blue-900">{modalProfile.summary.activeLoans}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Prest. em atraso</p>
                  <p className="text-lg font-bold text-amber-900">{modalProfile.summary.overdueInstallments}</p>
                </div>
              </div>

              {modalProfile.summary.nextDueDate && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-indigo-900">Próxima prestação</p>
                    <p className="text-xs text-indigo-700">
                      {new Date(modalProfile.summary.nextDueDate).toLocaleDateString("pt-MZ")} — {formatCurrencyMT(modalProfile.summary.nextDueAmount)}
                    </p>
                  </div>
                </div>
              )}

              {/* Tabs for Active/Paid/All */}
              <Tabs value={modalTab} onValueChange={setModalTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all">Todos</TabsTrigger>
                  <TabsTrigger value="active">Activos</TabsTrigger>
                  <TabsTrigger value="paid">Pagos</TabsTrigger>
                </TabsList>

                <TabsContent value={modalTab} className="mt-3">
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Contrato</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Principal</TableHead>
                          <TableHead>Saldo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Taxa</TableHead>
                          <TableHead>Atraso</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayLoans.map((loan) => (
                          <TableRow key={loan.id}>
                            <TableCell className="font-mono text-sm">{loan.contractNo}</TableCell>
                            <TableCell>{loan.product}</TableCell>
                            <TableCell>{formatCurrencyMT(loan.principal)}</TableCell>
                            <TableCell className="font-semibold">{formatCurrencyMT(loan.balance)}</TableCell>
                            <TableCell>
                              <Badge className={statusProfileBadge(loan.status)}>{loan.status}</Badge>
                            </TableCell>
                            <TableCell>{loan.interestRate ? `${loan.interestRate}%` : "-"}</TableCell>
                            <TableCell>{loan.daysOverdue > 0 ? `${loan.daysOverdue} dias` : "-"}</TableCell>
                          </TableRow>
                        ))}
                        {displayLoans.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-slate-500 py-6">
                              Nenhum crédito encontrado nesta categoria.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Evaluations */}
              {modalProfile.evaluations.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <Banknote className="w-4 h-4" /> Avaliações de crédito recentes
                  </p>
                  <div className="space-y-2">
                    {modalProfile.evaluations.slice(0, 3).map((e) => (
                      <div key={e.id} className="text-xs text-slate-600 border-b border-slate-100 pb-2 last:border-0">
                        <span className="font-medium">{new Date(e.createdAt).toLocaleDateString("pt-MZ")}</span>
                        {" — "}Score {e.finalScore}, {e.decision} ({e.analystName})
                        {e.note && <p className="mt-1 text-slate-500">{e.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SMS History */}
              {modalProfile.smsHistory.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Últimos SMS / Alertas
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {modalProfile.smsHistory.slice(0, 5).map((s) => (
                      <div key={s.id} className="text-xs text-slate-600">
                        <span className="font-medium">{new Date(s.sentAt || s.createdAt).toLocaleString("pt-MZ")}</span>
                        {" — "}{s.messageType}: {s.messageBody?.slice(0, 100)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Print Button */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={handlePrintCreditState}>
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir / PDF — Estado Actual
                </Button>
              </div>
            </div>
          )}

          {!modalLoading && !modalProfile && modalClient && (
            <p className="text-sm text-slate-500 py-6 text-center">Perfil de crédito não disponível para este cliente.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
