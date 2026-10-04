import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CreditCard,
  Loader2,
  MessageSquare,
  Printer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { fetchClientCreditProfile, type ClientCreditProfile } from "../../lib/notifications";
import { formatCurrencyMT } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";

type Props = {
  clientId: number | null;
  clientName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function statusBadge(status: string) {
  if (status === "late" || status === "overdue") return "bg-red-100 text-red-800";
  if (status === "partial") return "bg-amber-100 text-amber-800";
  if (status === "paid" || status === "closed") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function printPaymentReceipt(
  repayment: ClientCreditProfile["repayments"][0],
  profile: ClientCreditProfile,
  contractNo: string
) {
  const now = new Date().toLocaleString("pt-PT");
  const paymentDate = new Date(repayment.paymentDate).toLocaleDateString("pt-MZ");
  const client = profile.client;
  const loan = profile.loans.find((l) => l.contractNo === repayment.contractNo || l.contractNo === contractNo);
  const totalPaidForLoan = profile.repayments
    .filter((r) => r.loanId === repayment.loanId || r.contractNo === repayment.contractNo)
    .reduce((s, r) => s + r.amountApplied, 0);
  const remainingBalance = loan ? loan.balance : 0;
  const originalPrincipal = loan ? loan.principal : 0;
  const hasMora = repayment.moraApplied > 0;

  const receiptHtml = (copyType: "Cliente" | "Empresa") => `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #ccc; border-radius: 8px; page-break-inside: avoid;">
      <div style="text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="margin: 0; color: #1e3a5f; font-size: 20px;">RECIBO DE PAGAMENTO</h2>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Cópia: ${copyType}</p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px;">
        <div>
          <p style="margin: 2px 0;"><strong>Cliente:</strong> ${client.name}</p>
          <p style="margin: 2px 0;"><strong>NUIT:</strong> ${client.nuit || "—"}</p>
          <p style="margin: 2px 0;"><strong>Contacto:</strong> ${client.phone || "—"}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 2px 0;"><strong>Recibo Nº:</strong> ${repayment.receiptNo || `#${repayment.id}`}</p>
          <p style="margin: 2px 0;"><strong>Emissão:</strong> ${now}</p>
          <p style="margin: 2px 0;"><strong>Pagamento:</strong> ${paymentDate}</p>
        </div>
      </div>

      <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin-bottom: 12px; font-size: 13px;">
        <p style="margin: 4px 0;"><strong>Contrato:</strong> ${repayment.contractNo || contractNo}</p>
        <p style="margin: 4px 0;"><strong>Produto:</strong> ${loan?.product || "—"} | <strong>Principal:</strong> ${formatCurrencyMT(originalPrincipal)}</p>
        <p style="margin: 4px 0;"><strong>Total pago antes deste:</strong> ${formatCurrencyMT(totalPaidForLoan - repayment.amountApplied)}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px;">
        <tr style="background: #1e3a5f; color: white;">
          <th style="padding: 8px 10px; text-align: left;">Descrição</th>
          <th style="padding: 8px 10px; text-align: right;">Valor (MT)</th>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 10px;">Valor Recebido</td>
          <td style="padding: 8px 10px; text-align: right; font-weight: bold;">${formatCurrencyMT(repayment.amountReceived)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0; background: #f0fdf4;">
          <td style="padding: 8px 10px;">Valor Aplicado ao Crédito</td>
          <td style="padding: 8px 10px; text-align: right; font-weight: bold; color: #16a34a;">${formatCurrencyMT(repayment.amountApplied)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 10px; padding-left: 20px;">— Capital (Amortização)</td>
          <td style="padding: 8px 10px; text-align: right;">${formatCurrencyMT(repayment.principalApplied)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 10px; padding-left: 20px;">— Juros</td>
          <td style="padding: 8px 10px; text-align: right;">${formatCurrencyMT(repayment.interestApplied)}</td>
        </tr>
        ${hasMora ? `
        <tr style="border-bottom: 1px solid #e2e8f0; background: #fef2f2;">
          <td style="padding: 8px 10px; padding-left: 20px; color: #dc2626;">— Mora / Juros de Atraso</td>
          <td style="padding: 8px 10px; text-align: right; color: #dc2626; font-weight: bold;">${formatCurrencyMT(repayment.moraApplied)}</td>
        </tr>
        ` : ""}
      </table>

      ${hasMora ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 12px; color: #dc2626;">
        <strong>⚠ Atenção:</strong> Este pagamento inclui juros de mora no valor de ${formatCurrencyMT(repayment.moraApplied)} por atraso no pagamento.
      </div>
      ` : ""}

      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 12px;">
        <div style="background: #e0f2fe; padding: 8px 12px; border-radius: 6px; flex: 1; margin-right: 8px;">
          <p style="margin: 2px 0;"><strong>Total Pago (acumulado):</strong></p>
          <p style="margin: 2px 0; font-size: 18px; color: #2563eb;">${formatCurrencyMT(totalPaidForLoan)}</p>
        </div>
        <div style="background: #fef2f2; padding: 8px 12px; border-radius: 6px; flex: 1; margin-left: 8px;">
          <p style="margin: 2px 0;"><strong>Saldo Remanescente:</strong></p>
          <p style="margin: 2px 0; font-size: 18px; color: #dc2626;">${formatCurrencyMT(remainingBalance)}</p>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 12px; border-top: 1px dashed #ccc; font-size: 12px;">
        <div>
          <p style="margin: 2px 0;"><strong>Emitido por:</strong> ${loan?.managerName || "Sistema"}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 2px 0;"><strong>Assinatura do Cliente:</strong></p>
          <div style="height: 30px;"></div>
          <p style="margin: 2px 0; border-top: 1px solid #333; width: 200px; margin-left: auto;">${client.name}</p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 16px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px;">
        Documento gerado electronicamente em ${now} — Válido como comprovativo de pagamento.
      </div>
    </div>
  `;

  const fullHtml = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 10mm; size: A4; }
          body { margin: 0; padding: 0; }
          .page { page-break-after: always; }
          .page:last-child { page-break-after: avoid; }
        </style>
      </head>
      <body>
        <div class="page">${receiptHtml("Cliente")}</div>
        <div class="page">${receiptHtml("Empresa")}</div>
      </body>
    </html>
  `;

  openCorporatePrintWindow({
    title: `Recibo_${repayment.receiptNo || repayment.id}_${repayment.contractNo || contractNo}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
    bodyHtml: fullHtml,
    browserControls: true,
  });
}

export default function ClientCreditDetails({ clientId, clientName, open, onOpenChange }: Props) {
  const [profile, setProfile] = useState<ClientCreditProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !clientId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError("");
    void fetchClientCreditProfile(clientId)
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar perfil de credito."))
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const summary = profile?.summary;
  const displayName = profile?.client.name || clientName || "Cliente";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            Detalhes de Credito — {displayName}
          </DialogTitle>
          <DialogDescription>
            Historico completo de contratos, pagamentos (com impressão de recibo), prestacoes pendentes e comunicacoes SMS.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            A carregar perfil de credito...
          </div>
        )}

        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {profile && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saldo em divida</p>
                <p className="text-lg font-bold text-red-700">{formatCurrencyMT(summary?.totalDebt || 0)}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Total pago</p>
                <p className="text-lg font-bold text-emerald-900">{formatCurrencyMT(summary?.totalPaid || 0)}</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs text-blue-700">Contratos activos</p>
                <p className="text-lg font-bold text-blue-900">{summary?.activeLoans || 0}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Prestacoes em atraso</p>
                <p className="text-lg font-bold text-amber-900">{summary?.overdueInstallments || 0}</p>
              </div>
            </div>

            {summary?.nextDueDate && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-indigo-900">Proxima prestacao</p>
                  <p className="text-xs text-indigo-700">
                    {new Date(summary.nextDueDate).toLocaleDateString("pt-MZ")} — {formatCurrencyMT(summary.nextDueAmount)}
                  </p>
                </div>
              </div>
            )}

            <Tabs defaultValue="payments">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="contracts">Contratos</TabsTrigger>
                <TabsTrigger value="payments">Pagamentos</TabsTrigger>
                <TabsTrigger value="installments">Prestacoes</TabsTrigger>
                <TabsTrigger value="sms">SMS / Alertas</TabsTrigger>
              </TabsList>

              <TabsContent value="contracts">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Contrato</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Saldo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Atraso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profile.loans.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell className="font-mono text-sm">{loan.contractNo}</TableCell>
                          <TableCell>{loan.product}</TableCell>
                          <TableCell>{formatCurrencyMT(loan.principal)}</TableCell>
                          <TableCell className="font-semibold">{formatCurrencyMT(loan.balance)}</TableCell>
                          <TableCell><Badge className={statusBadge(loan.status)}>{loan.status}</Badge></TableCell>
                          <TableCell>{loan.daysOverdue > 0 ? `${loan.daysOverdue} dias` : "-"}</TableCell>
                        </TableRow>
                      ))}
                      {profile.loans.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-sm text-slate-500 py-6">Sem contratos registados.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="payments">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Data</TableHead>
                        <TableHead>Recibo</TableHead>
                        <TableHead>Contrato</TableHead>
                        <TableHead>Recebido</TableHead>
                        <TableHead>Aplicado</TableHead>
                        <TableHead>Capital</TableHead>
                        <TableHead>Juros</TableHead>
                        <TableHead>Mora</TableHead>
                        <TableHead className="text-right">Imprimir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profile.repayments.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{new Date(r.paymentDate).toLocaleDateString("pt-MZ")}</TableCell>
                          <TableCell className="font-mono text-sm">{r.receiptNo || "-"}</TableCell>
                          <TableCell>{r.contractNo || "-"}</TableCell>
                          <TableCell>{formatCurrencyMT(r.amountReceived)}</TableCell>
                          <TableCell className="font-semibold text-emerald-700">{formatCurrencyMT(r.amountApplied)}</TableCell>
                          <TableCell>{formatCurrencyMT(r.principalApplied)}</TableCell>
                          <TableCell>{formatCurrencyMT(r.interestApplied)}</TableCell>
                          <TableCell>
                            {r.moraApplied > 0 ? (
                              <span className="text-red-600 font-medium">{formatCurrencyMT(r.moraApplied)}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => printPaymentReceipt(r, profile, r.contractNo || "")}
                              title="Imprimir recibo de pagamento"
                            >
                              <Printer className="w-4 h-4 text-cyan-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {profile.repayments.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-sm text-slate-500 py-6">Sem pagamentos registados.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="installments">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Contrato</TableHead>
                        <TableHead>Prestacao</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profile.pendingInstallments.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-mono text-sm">{i.contractNo}</TableCell>
                          <TableCell>#{i.installmentNo}</TableCell>
                          <TableCell>{new Date(i.dueDate).toLocaleDateString("pt-MZ")}</TableCell>
                          <TableCell className="font-semibold">{formatCurrencyMT(i.paymentAmount)}</TableCell>
                          <TableCell><Badge className={statusBadge(i.status)}>{i.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {profile.pendingInstallments.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-slate-500 py-6">Sem prestacoes pendentes.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="sms">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profile.smsHistory.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{new Date(s.sentAt || s.createdAt).toLocaleString("pt-MZ")}</TableCell>
                          <TableCell>
                            <Badge className="bg-indigo-100 text-indigo-800">
                              <MessageSquare className="w-3 h-3 mr-1 inline" />
                              {s.messageType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-md">{s.messageBody}</TableCell>
                          <TableCell><Badge className={s.status === "sent" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>{s.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {profile.smsHistory.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">Sem SMS enviados ainda.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>

            {profile.evaluations.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Banknote className="w-4 h-4" /> Avaliacoes de credito recentes
                </p>
                <div className="space-y-2">
                  {profile.evaluations.slice(0, 3).map((e) => (
                    <div key={e.id} className="text-xs text-slate-600 border-b border-slate-100 pb-2 last:border-0">
                      <span className="font-medium">{new Date(e.createdAt).toLocaleDateString("pt-MZ")}</span>
                      {" — "}
                      Score {e.finalScore}, {e.decision} ({e.analystName})
                      {e.note && <p className="mt-1 text-slate-500">{e.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}