import { useCallback, useEffect, useState } from "react";
import { Calendar, Eye } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { formatCurrencyMT } from "../../lib/format";

type LoanRow = {
  id: number;
  contractNo: string;
  client: string;
  amount: number;
  balance: number;
  nextPayment: string;
  maturity: string;
  status: string;
  daysOverdue: number;
};

type Installment = {
  installmentNo: number;
  dueDate: string;
  paymentAmount: number;
  principalAmount: number;
  interestAmount: number;
  balanceAfter: number;
  status: "paid" | "pending" | "late";
};

type InstallmentsResponse = {
  contractNo: string;
  summary: { total: number; paid: number; pending: number; late: number; pendingAmount: number };
  installments: Installment[];
};

export default function PlanoDePagPage() {
  const [search, setSearch] = useState("");
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<LoanRow | null>(null);
  const [schedule, setSchedule] = useState<InstallmentsResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const loadLoans = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, status: "all", clientType: "all" });
      const data = await apiFetch<{ loans: LoanRow[] }>(`/loans?${params.toString()}`);
      setLoans((data.loans || []).filter((loan) => loan.status !== "rejected"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar contratos.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadLoans();
  }, [loadLoans]);

  const openSchedule = async (loan: LoanRow) => {
    setSelected(loan);
    setSchedule(null);
    setScheduleLoading(true);
    try {
      const data = await apiFetch<InstallmentsResponse>(`/loans/${loan.id}/installments`);
      setSchedule(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar plano de pagamento.");
    } finally {
      setScheduleLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-emerald-600" />
          Plano de Pagamento
        </h1>
        <p className="text-sm text-slate-600 mt-1">Cronograma de prestacoes, vencimentos e saldo remanescente por contrato.</p>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-3">
        <Input
          className="max-w-md"
          placeholder="Pesquisar contrato ou cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" onClick={() => void loadLoans()}>
          Atualizar
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contrato</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Capital</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Proximo venc.</TableHead>
              <TableHead>Maturidade</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Plano</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-slate-500 py-8">
                  A carregar contratos...
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-mono">{loan.contractNo}</TableCell>
                  <TableCell>{loan.client}</TableCell>
                  <TableCell>{formatCurrencyMT(loan.amount)}</TableCell>
                  <TableCell>{formatCurrencyMT(loan.balance)}</TableCell>
                  <TableCell>{loan.nextPayment || "-"}</TableCell>
                  <TableCell>{loan.maturity || "-"}</TableCell>
                  <TableCell>
                    <Badge className={loan.daysOverdue > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}>
                      {loan.daysOverdue > 0 ? `${loan.daysOverdue}d atraso` : loan.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => void openSchedule(loan)}>
                      <Eye className="w-4 h-4 mr-1" />
                      Ver plano
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && loans.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-slate-500 py-8">
                  Nenhum contrato encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plano de Pagamento — {selected?.contractNo}</DialogTitle>
            <DialogDescription>{selected?.client}</DialogDescription>
          </DialogHeader>
          {scheduleLoading && <p className="text-sm text-slate-600">A carregar cronograma...</p>}
          {schedule && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border p-3 bg-slate-50">
                  <p className="text-slate-500">Parcelas</p>
                  <p className="font-bold">{schedule.summary.total}</p>
                </div>
                <div className="rounded-lg border p-3 bg-emerald-50">
                  <p className="text-emerald-700">Pagas</p>
                  <p className="font-bold text-emerald-900">{schedule.summary.paid}</p>
                </div>
                <div className="rounded-lg border p-3 bg-amber-50">
                  <p className="text-amber-700">Pendentes</p>
                  <p className="font-bold text-amber-900">{schedule.summary.pending}</p>
                </div>
                <div className="rounded-lg border p-3 bg-blue-50">
                  <p className="text-blue-700">Remanescente</p>
                  <p className="font-bold text-blue-900">{formatCurrencyMT(schedule.summary.pendingAmount)}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Prestacao</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Juros</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.installments.map((row) => (
                    <TableRow key={row.installmentNo}>
                      <TableCell>{row.installmentNo}</TableCell>
                      <TableCell>{row.dueDate}</TableCell>
                      <TableCell>{formatCurrencyMT(row.paymentAmount)}</TableCell>
                      <TableCell>{formatCurrencyMT(row.principalAmount)}</TableCell>
                      <TableCell>{formatCurrencyMT(row.interestAmount)}</TableCell>
                      <TableCell>{formatCurrencyMT(row.balanceAfter)}</TableCell>
                      <TableCell className="uppercase text-xs">{row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
