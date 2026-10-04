import { useState, useEffect, useMemo } from "react";
import { Users, Search, Download, Loader2, Filter, Layers, Briefcase, ChevronDown, Printer } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients, type ClientSummary } from "../../lib/clients";
import { listCarteiras, type Carteira } from "../../lib/carteiras";
import { formatCurrencyMT } from "../../lib/format";
import { downloadTextFile, toCsv } from "../../lib/download";
import { openCorporatePrintWindow } from "../../lib/print";

export default function ClientesReportPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.relatorios");
  const canExport = hasPermission(user, "exportar.relatorios");

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [carteiras, setCarteiras] = useState<Carteira[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCarteira, setSelectedCarteira] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    Promise.all([
      fetchClients().catch(() => []),
      listCarteiras().then((r) => r.carteiras || []).catch(() => []),
    ]).then(([clientList, carteiraList]) => {
      if (!ignore) {
        setClients(clientList);
        setCarteiras(carteiraList);
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const matchSearch =
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.nuit?.includes(search) ||
        c.phone?.includes(search);
      const matchCarteira =
        selectedCarteira === "all" ||
        String(c.carteiraId) === selectedCarteira ||
        c.carteiraNome?.toLowerCase() === selectedCarteira.toLowerCase();
      const matchType = selectedType === "all" || c.type === selectedType;
      return matchSearch && matchCarteira && matchType;
    });
  }, [clients, search, selectedCarteira, selectedType]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>Sem permissão para visualizar relatórios.</p>
      </div>
    );
  }

  const totalClients = filteredClients.length;
  const singular = filteredClients.filter((c) => c.type === "singular").length;
  const grupos = filteredClients.filter((c) => c.type === "grupo").length;
  const empresas = filteredClients.filter((c) => c.type === "empresa").length;
  const totalDivida = filteredClients.reduce((sum, c) => sum + Number(c.debt || 0), 0);

  const handleExportCSV = () => {
    const csvRows = filteredClients.map((c) => ({
      Nome: c.name,
      Tipo: c.type === "singular" ? "Singular" : c.type === "grupo" ? "Grupo" : "Empresa",
      NUIT: c.nuit || "—",
      Contacto: c.phone || "—",
      Carteira: c.carteiraNome || "Geral",
      Gestor: c.gestorName || "—",
      Score: c.score || 700,
      Dívida_MT: Number(c.debt || 0),
      Estado: c.status || "active",
    }));
    const csv = toCsv(csvRows);
    downloadTextFile(`relatorio-clientes-${Date.now()}.csv`, csv, "text/csv;charset=utf-8;");
  };

  const handlePrint = () => {
    const html = `
      <h2>Relatório Geral de Clientes por Carteira</h2>
      <p>Data de Emissão: ${new Date().toLocaleDateString("pt-MZ")}</p>
      <p>Total de Registos: ${totalClients} | Dívida Acumulada: ${formatCurrencyMT(totalDivida)}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th>Cliente</th>
            <th>Tipo</th>
            <th>NUIT</th>
            <th>Telefone</th>
            <th>Carteira</th>
            <th>Gestor Responsável</th>
            <th>Score</th>
            <th>Dívida Total (MT)</th>
          </tr>
        </thead>
        <tbody>
          ${filteredClients
            .map(
              (c) => `
            <tr>
              <td>${c.name}</td>
              <td>${c.type}</td>
              <td>${c.nuit || "—"}</td>
              <td>${c.phone || "—"}</td>
              <td>${c.carteiraNome || "Geral"}</td>
              <td>${c.gestorName || "—"}</td>
              <td>${c.score || 700}</td>
              <td align="right">${formatCurrencyMT(c.debt || 0)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
    openCorporatePrintWindow({
      title: "Relatório de Clientes por Carteira",
      html,
      reportName: "RELATÓRIO DE CLIENTES",
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg text-white">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Relatório de Clientes por Carteira</h1>
            <p className="text-sm text-slate-500">
              Listagem consolidada de proponentes com Carteira e Gestor atribuído
            </p>
          </div>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 shadow-sm"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> A carregar dados do sistema...
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Total Clientes</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalClients}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Singulares</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{singular}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Grupos Solidários</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{grupos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Empresas</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{empresas}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Dívida Total da Carteira</p>
          <p className="text-xl font-bold text-indigo-700 mt-1 truncate">{formatCurrencyMT(totalDivida)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, NUIT ou contacto..."
            className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filtro por Carteira */}
        <div className="relative min-w-[180px]">
          <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={selectedCarteira}
            onChange={(e) => setSelectedCarteira(e.target.value)}
            className="w-full h-9 pl-8 pr-8 text-xs font-medium rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
          >
            <option value="all">Todas as Carteiras</option>
            {carteiras.map((cart) => (
              <option key={cart.id} value={String(cart.id)}>
                {cart.name} ({cart.gestor_name || "Gestor"})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Filtro por Tipo */}
        <div className="relative min-w-[150px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full h-9 pl-8 pr-8 text-xs font-medium rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
          >
            <option value="all">Todos os Tipos</option>
            <option value="singular">Singulares</option>
            <option value="grupo">Grupos</option>
            <option value="empresa">Empresas</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Tabela de Clientes com Carteira e Gestor */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">NUIT / Contacto</th>
                <th className="px-3 py-3">Carteira</th>
                <th className="px-3 py-3">Gestor Responsável</th>
                <th className="px-3 py-3 text-right">Dívida Total</th>
                <th className="px-3 py-3 text-center">Score</th>
                <th className="px-3 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.length > 0 ? (
                filteredClients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          c.type === "singular"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : c.type === "grupo"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {c.type === "singular" ? "Singular" : c.type === "grupo" ? "Grupo" : "Empresa"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      <div>NUIT: {c.nuit || "—"}</div>
                      <div className="text-[11px] text-slate-400">{c.phone || "—"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        <Layers className="w-3 h-3 text-slate-500" />
                        {c.carteiraNome || "Carteira Geral"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        <Briefcase className="w-3 h-3 text-indigo-500" />
                        {c.gestorName || "Gestor Atribuído"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {formatCurrencyMT(c.debt || 0)}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-bold text-indigo-600">
                      {c.score || 700}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          c.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.status === "active" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    Nenhum cliente encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}