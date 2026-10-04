import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Check, RefreshCw, X } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  type Carteira,
  type Transfer,
  decideTransfer,
  listCarteiras,
  listTransfers,
  requestTransfer,
} from "../../lib/carteiras";
import { getUser } from "../../lib/auth";
import { hasPermission } from "../../lib/permissions";

const statusBadge = (status: Transfer["status"]) => {
  const map: Record<Transfer["status"], string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-600",
  };
  const label = { pending: "Pendente", approved: "Aprovada", rejected: "Rejeitada", cancelled: "Cancelada" }[status];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status]}`}>{label}</span>;
};

export default function TransferenciasPage() {
  const user = getUser();
  const canTransfer = hasPermission(user, "gerir.carteiras");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [carteiras, setCarteiras] = useState<Carteira[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ clientId: "", destPortfolioId: "", reason: "" });

  // __LOAD__

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([listTransfers(), listCarteiras()]);
      setTransfers(t.transfers || []);
      setCarteiras(c.carteiras || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar transferências.");
    }
  }, []);

  useEffect(() => {
    if (canTransfer) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.clientId || !form.destPortfolioId) {
      setError("Cliente e carteira de destino são obrigatórios.");
      return;
    }
    try {
      await requestTransfer({
        clientId: Number(form.clientId),
        destPortfolioId: Number(form.destPortfolioId),
        reason: form.reason.trim() || undefined,
        autoApprove: true,
      });
      setMessage("Transferência efectuada. Cliente e créditos movidos para a nova carteira.");
      setShowModal(false);
      setForm({ clientId: "", destPortfolioId: "", reason: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao transferir.");
    }
  }

  async function decide(id: number, decision: "approve" | "reject") {
    setError("");
    try {
      await decideTransfer(id, decision);
      setMessage(decision === "approve" ? "Transferência aprovada." : "Transferência rejeitada.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na decisão.");
    }
  }

  const flatOptions = carteiras.flatMap((root) => [
    { id: root.id, label: root.name },
    ...(root.children ?? []).map((s) => ({ id: s.id, label: `${root.name} › ${s.name}` })),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-emerald-600" />
            Transferências
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Trocar um cliente de gestor/carteira — move o cliente e os seus créditos.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm({ clientId: "", destPortfolioId: "", reason: "" });
            setShowModal(true);
          }}
        >
          Nova transferência
        </Button>
      </div>

      {message && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">{message}</div>
      )}
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de transferências</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Estado</TableHead>
                {canTransfer && <TableHead>Acções</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.client_name ?? `#${t.client_id}`}</TableCell>
                  <TableCell>{t.origin_portfolio_name || "—"}</TableCell>
                  <TableCell>{t.dest_portfolio_name || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{t.reason || "—"}</TableCell>
                  <TableCell>{statusBadge(t.status)}</TableCell>
                  {canTransfer && (
                    <TableCell>
                      {t.status === "pending" ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => decide(t.id, "approve")}>
                            <Check className="w-3 h-3 text-emerald-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => decide(t.id, "reject")}>
                            <X className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {transfers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canTransfer ? 6 : 5} className="text-center text-sm text-slate-500 py-8">
                    Sem transferências registadas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova transferência de cliente</DialogTitle>
            <DialogDescription>
              Indique o ID do cliente e a carteira/gestor de destino. O cliente e os seus créditos passam para a nova carteira.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-1 gap-3">
            <div>
              <Label>ID do cliente *</Label>
              <Input
                type="number"
                value={form.clientId}
                onChange={(e) => setForm((s) => ({ ...s, clientId: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label className="text-slate-700 font-medium">Carteira / gestor de destino *</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-sm"
                value={form.destPortfolioId}
                onChange={(e) => setForm((s) => ({ ...s, destPortfolioId: e.target.value }))}
                required
              >
                <option value="" className="text-slate-500 bg-white">Selecione a carteira...</option>
                {flatOptions.map((o) => (
                  <option key={o.id} value={o.id} className="text-slate-900 bg-white">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Input value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Transferir</Button>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
