import { useMemo, useState } from "react";
import { Shield, Search, CheckCircle2, AlertTriangle, XCircle, CreditCard } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import ClientCreditDetails from "../../components/clients/ClientCreditDetails";
import { apiFetch } from "../../lib/api";
import { formatCurrencyMT } from "../../lib/format";

type ClientRiskBase = {
  id: number;
  name: string;
  nuit: string;
  score: number;
  debt: number;
  status: string;
};

type ClientsResponse = {
  clients: ClientRiskBase[];
  crossCompanyMatches?: CrossCompanyMatch[];
};

type RiskRecord = {
  id: number;
  client: string;
  nuit: string;
  score: number;
  debt: number;
  riskStatus: "clear" | "attention" | "risk";
};

type CrossCompanyMatch = {
  clientId: number;
  clientName: string;
  nuit: string;
  score: number;
  status: string;
  debt: number;
  activeLoans: number;
  companyId: number;
  companyName: string;
};

function resolveRiskStatus(client: ClientRiskBase): RiskRecord["riskStatus"] {
  if (client.status === "alert" || client.score < 600 || client.debt >= 80000) return "risk";
  if (client.status === "warning" || client.score < 700 || client.debt > 0) return "attention";
  return "clear";
}

export default function RiskCenterPage() {
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "clear" | "attention" | "risk">("all");
  const [message, setMessage] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<RiskRecord[]>([]);
  const [crossRecords, setCrossRecords] = useState<CrossCompanyMatch[]>([]);
  const [creditDetailClient, setCreditDetailClient] = useState<{ id: number; name: string } | null>(null);

  const result = useMemo(() => records[0] ?? null, [records]);

  const handleSearch = async () => {
    try {
      setLoading(true);
      setSearched(true);
      const search = query.trim();
      const response = await apiFetch<ClientsResponse>(`/clients?search=${encodeURIComponent(search)}&type=all`);

      const normalized: RiskRecord[] = (response.clients || []).map((client) => ({
        id: client.id,
        client: client.name,
        nuit: client.nuit,
        score: client.score,
        debt: Number(client.debt || 0),
        riskStatus: resolveRiskStatus(client),
      }));

      const filtered = normalized
        .filter((item) => {
          if (riskFilter === "all") return true;
          return item.riskStatus === riskFilter;
        })
        .sort((a, b) => b.debt - a.debt || a.client.localeCompare(b.client));
      const crossMatches = (response.crossCompanyMatches || [])
        .slice()
        .sort((a, b) => b.activeLoans - a.activeLoans || b.debt - a.debt || a.clientName.localeCompare(b.clientName));

      setRecords(filtered);
      setCrossRecords(crossMatches);
      if (filtered.length === 0 && crossMatches.length === 0) {
        setMessage("Nenhum cliente encontrado para o filtro informado.");
      } else if (crossMatches.length > 0) {
        setMessage(`Consulta CRC concluida com sucesso. Encontrados ${crossMatches.length} registo(s) em outras empresas.`);
      } else {
        setMessage("Consulta CRC concluida com sucesso.");
      }
    } catch (error) {
      setRecords([]);
      setCrossRecords([]);
      setMessage(error instanceof Error ? error.message : "Falha ao consultar central de risco.");
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (status: RiskRecord["riskStatus"]) => {
    if (status === "clear") return "Sem restricoes";
    if (status === "attention") return "Atencao";
    return "Alto risco";
  };

  const statusBadgeClass = (status: RiskRecord["riskStatus"]) => {
    if (status === "clear") return "bg-emerald-100 text-emerald-800";
    if (status === "attention") return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Central de Risco</h1>
        <p className="text-slate-600 mt-1">Consulta de historico crediticio - CRC</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-red-100 rounded-xl">
            <Shield className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Consulta CRC - Banco de Mocambique</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">NUIT ou Nome do Cliente</label>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
              <Input
                placeholder="Ex: 123456789 ou nome do cliente"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as "all" | "clear" | "attention" | "risk")}
              >
                <option value="all">Todos os riscos</option>
                <option value="clear">Sem restricoes</option>
                <option value="attention">Atencao</option>
                <option value="risk">Alto risco</option>
              </select>
              <Button className="bg-gradient-to-r from-red-500 to-rose-600" onClick={handleSearch} disabled={loading}>
                <Search className="w-4 h-4 mr-2" />
                {loading ? "A consultar..." : "Consultar"}
              </Button>
            </div>
          </div>

          {searched && (
            <div className={`p-4 border rounded-lg ${records.length > 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <p className={`text-sm ${records.length > 0 ? "text-emerald-700" : "text-amber-700"}`}>{message}</p>
            </div>
          )}

          {result && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{result.client}</p>
                  <p className="text-sm text-slate-600">NUIT: {result.nuit}</p>
                </div>
                <Badge className={statusBadgeClass(result.riskStatus)}>{statusLabel(result.riskStatus)}</Badge>
              </div>
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => setCreditDetailClient({ id: result.id, name: result.client })}>
                  <CreditCard className="w-4 h-4 mr-1" />
                  Ver detalhes de credito
                </Button>
              </div>
              <div className="grid md:grid-cols-3 gap-4 mt-3">
                <div>
                  <p className="text-xs text-slate-500">Score</p>
                  <p className="font-semibold text-slate-900">{result.score}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Divida reportada</p>
                  <p className="font-semibold text-slate-900">{formatCurrencyMT(result.debt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {result.riskStatus === "clear" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : result.riskStatus === "attention" ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className="text-sm text-slate-700">Resultado da consulta</span>
                </div>
              </div>
            </div>
          )}

          {crossRecords.length > 0 && (
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900">Registos partilhados entre empresas</h3>
                <Badge className="bg-blue-100 text-blue-800">{crossRecords.length} encontrado(s)</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600 border-b">
                      <th className="py-2 pr-3">Cliente</th>
                      <th className="py-2 pr-3">Empresa</th>
                      <th className="py-2 pr-3">NUIT</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Divida</th>
                      <th className="py-2 pr-3">Emprestimos vigentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossRecords.map((item) => (
                      <tr key={`${item.companyId}-${item.clientId}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-slate-900">{item.clientName}</td>
                        <td className="py-2 pr-3 text-slate-700">{item.companyName}</td>
                        <td className="py-2 pr-3 text-slate-700">{item.nuit}</td>
                        <td className="py-2 pr-3 text-slate-700">{item.score}</td>
                        <td className="py-2 pr-3 text-slate-700">{formatCurrencyMT(item.debt)}</td>
                        <td className="py-2 pr-3 text-slate-700">{item.activeLoans}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-6 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl text-white">
          <h3 className="text-lg font-semibold mb-3">Ocorrencias Encontradas</h3>
          <p className="text-4xl font-bold mb-2">{searched ? records.length + crossRecords.length : 0}</p>
          <p className="text-slate-300 text-sm">Inclui empresa ativa e registos cruzados</p>
        </div>
        <div className="p-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white">
          <h3 className="text-lg font-semibold mb-3">Taxa de Perfil Limpo</h3>
          <p className="text-4xl font-bold mb-2">
            {records.length === 0 ? "0%" : `${Math.round((records.filter((r) => r.riskStatus === "clear").length / records.length) * 100)}%`}
          </p>
          <p className="text-emerald-100 text-sm">Clientes sem restricoes no filtro atual</p>
        </div>
      </div>

      <ClientCreditDetails
        clientId={creditDetailClient?.id ?? null}
        clientName={creditDetailClient?.name}
        open={Boolean(creditDetailClient)}
        onOpenChange={(open) => { if (!open) setCreditDetailClient(null); }}
      />
    </div>
  );
}
