import { useState, useEffect, useMemo } from "react";
import { DollarSign, Search, Calendar, Download, CheckCircle2, History, Printer, Filter, FileText, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { decidirPedido, usePedidosPolling } from "../../lib/loans";
import { fetchClients, type ClientSummary } from "../../lib/clients";
import { listCarteiras, listGestores, type Carteira, type Gestor } from "../../lib/carteiras";
import { apiFetch } from "../../lib/api";
import { printDocumentoCredito, type DocumentPartyData } from "../../lib/creditDocuments";
import { generateInstallmentSchedule, calculateFinancialSummary, DIAS_UTEIS_PADRAO } from "../../lib/installments";
import type { Pedido, Installment as InstallmentType, CreditoAtivo, PedidoEstado } from "../../../../shared/types";
import { ESTADO_LABEL } from "../../../../shared/types";
import { PipelineList, PedidoDetailCards, GrupoMembrosSection, EmptyState } from "../../components/credits/PipelineShared";
import { formatCurrency, formatCurrencyMT } from "../../lib/format";

const CREDIT_STORAGE_KEY = "msu_creditos_ativos";

type StoredInstallment = InstallmentType & {
  dataPagamento: string | null;
  valorPago: number;
};

type StoredCredito = Omit<CreditoAtivo, "parcelas"> & {
  grupoNome?: string;
  liderGrupo?: string;
  descricaoGrupo?: string;
  parcelas: StoredInstallment[];
};

function loadCreditosDesembolsados(): StoredCredito[] {
  try {
    const raw: StoredCredito[] = JSON.parse(localStorage.getItem(CREDIT_STORAGE_KEY) || "[]");
    const cleaned = raw.filter(
      (c) =>
        c.contrato !== "REQ-2026-38551" &&
        c.contrato !== "MC-2026-001" &&
        !String(c.contrato).startsWith("REQ-2026-38551") &&
        !String(c.cliente || "").toLowerCase().includes("zeca ramane")
    );
    if (cleaned.length !== raw.length) {
      localStorage.setItem(CREDIT_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

// --- Filtros do relatório de desembolsos (modelo Desembolso.pdf) ---

type DesembolsadoRow = {
  creditoId: number;
  contrato: string;
  dataDesembolso: string; // formato DD/MM/AAAA
  dateKey: string;        // formato AAAA-MM-DD para comparação
  cliente: string;
  clienteId: number;
  ocupacao: string;
  contato: string;
  gestor: string;
  valorAprovado: number;
  dataAprovacao: string;
  aprovadoPor: string;
  dataAutorizacao: string;
  autorizadoPor: string;
  carteira: string;
  preparo: number;
  seguro: number;
  imposto: number;
  taxaDesembolso: number;
  capital: number;
  juro: number;
  mora: number;
  atrasadas: number;
  prazo: number;
  saldo: number;
  estado: string;
};

function parsePTDate(s: string): Date | null {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDateKey(s: string): string {
  const dt = parsePTDate(s);
  if (!dt) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function ptDate(iso: string): string {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function buildDesembolsadoRows(
  creditos: StoredCredito[],
  pedidos: Pedido[],
  clients: ClientSummary[],
  realCarteiras: Carteira[] = []
): DesembolsadoRow[] {
  const pedidoById = new Map(pedidos.map((p) => [p.id, p]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const carteiraById = new Map(realCarteiras.map((k) => [k.id, k]));
  const carteiraByName = new Map(realCarteiras.map((k) => [k.name.toLowerCase().trim(), k]));

  // Mapas de controle para unicidade estrita por pedido, contrato e crédito (zero duplicações)
  const seenPedidoIds = new Set<number>();
  const seenContracts = new Set<string>();
  const seenCreditoIds = new Set<number>();
  const rows: DesembolsadoRow[] = [];

  // 1. Processa os créditos ativos armazenados
  for (const c of creditos) {
    if (c.pedidoId && seenPedidoIds.has(c.pedidoId)) continue;
    if (c.contrato && seenContracts.has(c.contrato)) continue;
    if (c.id && seenCreditoIds.has(c.id)) continue;

    if (c.pedidoId) seenPedidoIds.add(c.pedidoId);
    if (c.contrato) seenContracts.add(c.contrato);
    if (c.id) seenCreditoIds.add(c.id);

    const pedido = c.pedidoId ? pedidoById.get(c.pedidoId) : undefined;
    const client = clientById.get(c.clienteId);
    const capital = Number(c.valorSolicitado || 0);
    const total = Number(c.totalAPagar || 0);

    const clientCarteiraId = client?.carteiraId || (c as any).carteiraId || (pedido as any)?.carteiraId;
    const foundByCartId = clientCarteiraId ? carteiraById.get(clientCarteiraId) : undefined;
    const foundByName = c.tipoCredito ? carteiraByName.get(c.tipoCredito.toLowerCase().trim()) : undefined;

    const carteiraName = client?.carteiraNome || foundByCartId?.name || foundByName?.name || c.tipoCredito || pedido?.tipoCredito || "Geral";
    const gestorName = client?.gestorName || foundByCartId?.gestor_name || foundByName?.gestor_name || pedido?.desembolsadoPor || "Gestor de Carteira";

    rows.push({
      creditoId: c.id,
      contrato: c.contrato,
      dataDesembolso: c.dataDesembolso || "",
      dateKey: toDateKey(c.dataDesembolso || ""),
      cliente: c.cliente || client?.name || "",
      clienteId: c.clienteId,
      ocupacao: client?.occupation || "",
      contato: client?.phone || "",
      gestor: gestorName,
      valorAprovado: Number(pedido?.valorAprovado || c.valorSolicitado || 0),
      dataAprovacao: pedido?.dataAprovacao || "",
      aprovadoPor: pedido?.aprovadoPor || "",
      dataAutorizacao: pedido?.dataAutorizacao || "",
      autorizadoPor: pedido?.autorizadoPor || "",
      carteira: carteiraName,
      preparo: 0,
      seguro: 0,
      imposto: 0,
      taxaDesembolso: 0,
      capital,
      juro: Math.max(0, total - capital),
      mora: Number(c.mora || 0),
      atrasadas: Number(c.prestacoesAtrasadas || 0),
      prazo: Number(c.prazo || pedido?.prazo || 0),
      saldo: Number(c.saldoDevedor || 0),
      estado: c.estado || "ativo",
    });
  }

  // 2. Processa pedidos que estejam no estado 'desembolsado' e que ainda não estejam na lista
  for (const p of pedidos) {
    if (p.estado !== "desembolsado") continue;
    if (seenPedidoIds.has(p.id)) continue;
    seenPedidoIds.add(p.id);

    const contractNo = `CT-${new Date().getFullYear()}-${String(p.id).padStart(4, "0")}`;
    if (seenContracts.has(contractNo)) continue;
    seenContracts.add(contractNo);

    const client = clientById.get(p.clienteId);
    const capital = Number(p.valor || 0);
    const juros = capital * (Number(p.taxa || 30) / 100) * Number(p.prazo || 1);

    const clientCarteiraId = client?.carteiraId || p.carteiraId;
    const foundByCartId = clientCarteiraId ? carteiraById.get(clientCarteiraId) : undefined;
    const carteiraName = p.carteiraNome || client?.carteiraNome || foundByCartId?.name || p.tipoCredito || "Geral";
    const gestorName = p.gestorName || client?.gestorName || foundByCartId?.gestor_name || p.desembolsadoPor || "Gestor";

    rows.push({
      creditoId: p.id,
      contrato: contractNo,
      dataDesembolso: p.dataDesembolso || new Date().toLocaleDateString("pt-PT"),
      dateKey: toDateKey(p.dataDesembolso || new Date().toLocaleDateString("pt-PT")),
      cliente: p.cliente || client?.name || "",
      clienteId: p.clienteId,
      ocupacao: client?.occupation || "",
      contato: client?.phone || "",
      gestor: gestorName,
      valorAprovado: Number(p.valorAprovado || p.valor || 0),
      dataAprovacao: p.dataAprovacao || "",
      aprovadoPor: p.aprovadoPor || "",
      dataAutorizacao: p.dataAutorizacao || "",
      autorizadoPor: p.autorizadoPor || "",
      carteira: carteiraName,
      preparo: 0,
      seguro: 0,
      imposto: 0,
      taxaDesembolso: 0,
      capital,
      juro: juros,
      mora: 0,
      atrasadas: 0,
      prazo: Number(p.prazo || 1),
      saldo: capital + juros,
      estado: "ativo",
    });
  }

  // Ordena com os processos mais recentes no topo
  return rows.sort((a, b) => b.creditoId - a.creditoId);
}

function generateInstallments(pedido: Pedido): StoredInstallment[] {
  const summary = calculateFinancialSummary(pedido.valor, pedido.prazo, pedido.taxa);
  const schedule = generateInstallmentSchedule(
    summary.totalToPay,
    pedido.prazo,
    pedido.frequencia,
    (pedido as any).paymentDaysOfWeek || DIAS_UTEIS_PADRAO
  );
  return schedule.map((item) => ({
    numParcela: item.numParcela,
    dataVencimento: item.dataVencimento,
    valor: item.valor,
    status: "pendente",
    dataPagamento: null,
    valorPago: 0,
  }));
}

export default function DesembolsoPage() {
  const user = getUser();
  const canView = hasPermission(user, "desembolsar.credito");

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [creditos, setCreditos] = useState<StoredCredito[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [realCarteiras, setRealCarteiras] = useState<Carteira[]>([]);
  const [realGestores, setRealGestores] = useState<Gestor[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"pendentes" | "desembolsados">("pendentes");
  // Filtros do relatório de desembolsos
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCarteira, setFilterCarteira] = useState("all");
  const [filterGestor, setFilterGestor] = useState("all");

  useEffect(() => usePedidosPolling(setPedidos), []);

  // Atualiza a lista de desembolsados (só leitura)
  useEffect(() => {
    setCreditos(loadCreditosDesembolsados());
    const interval = setInterval(() => setCreditos(loadCreditosDesembolsados()), 2000);
    return () => clearInterval(interval);
  }, []);

  // Clientes, Carteiras reais e Gestores reais
  useEffect(() => {
    fetchClients().then(setClients).catch(() => setClients([]));
    listCarteiras().then((res) => setRealCarteiras(res.carteiras || [])).catch(() => setRealCarteiras([]));
    listGestores().then((res) => setRealGestores(res.gestores || [])).catch(() => setRealGestores([]));
  }, []);

  const filtered = pedidos.filter((p) => {
    if (p.estado !== "liberado") return false;
    return p.cliente.toLowerCase().includes(search.toLowerCase());
  });

  const selected = pedidos.find((p) => p.id === selectedId) || null;

  // --- Relatório de desembolsados (filtros + totais) ---
  const desembolsadoRows = buildDesembolsadoRows(creditos, pedidos, clients, realCarteiras);

  const carteiraOptions = useMemo(() => {
    const fromRows = desembolsadoRows.map((r) => r.carteira).filter(Boolean);
    const fromDb = realCarteiras.map((k) => k.name).filter(Boolean);
    return Array.from(new Set([...fromDb, ...fromRows])).sort((a, b) => a.localeCompare(b));
  }, [desembolsadoRows, realCarteiras]);

  const gestorOptions = useMemo(() => {
    const fromRows = desembolsadoRows.map((r) => r.gestor).filter(Boolean);
    const fromDb = realGestores.map((g) => g.fullName).filter(Boolean);
    return Array.from(new Set([...fromDb, ...fromRows])).sort((a, b) => a.localeCompare(b));
  }, [desembolsadoRows, realGestores]);

  const desembolsadosFiltrados = desembolsadoRows.filter((r) => {
    const matchDateFrom = !dateFrom || (r.dateKey && r.dateKey >= dateFrom);
    const matchDateTo = !dateTo || (r.dateKey && r.dateKey <= dateTo);
    const matchCarteira = filterCarteira === "all" || r.carteira.toLowerCase() === filterCarteira.toLowerCase();
    const matchGestor = filterGestor === "all" || r.gestor.toLowerCase() === filterGestor.toLowerCase();
    const matchSearch = r.cliente.toLowerCase().includes(search.toLowerCase()) || r.contrato.toLowerCase().includes(search.toLowerCase());
    return matchDateFrom && matchDateTo && matchCarteira && matchGestor && matchSearch;
  });

  const reportTotals = desembolsadosFiltrados.reduce(
    (acc, r) => {
      acc.preparo += r.preparo;
      acc.seguro += r.seguro;
      acc.imposto += r.imposto;
      acc.taxa += r.taxaDesembolso;
      acc.capital += r.capital;
      acc.juro += r.juro;
      return acc;
    },
    { preparo: 0, seguro: 0, imposto: 0, taxa: 0, capital: 0, juro: 0, mora: 0, atrasadas: 0 }
  );

  const [expandedContract, setExpandedContract] = useState<string | null>(null);

  const handlePrintDoc = (
    tipo: "contrato" | "confissao" | "termo_bens" | "declaracao_garantia" | "desconto_salarial" | "termo_compromisso" | "recibo_desembolso" | "dossie_completo",
    row: DesembolsadoRow
  ) => {
    const client = clients.find((c) => c.id === row.clienteId);
    const pedido = pedidos.find((p) => p.id === (creditos.find((c) => c.contrato === row.contrato)?.pedidoId || row.creditoId));
    const docData: DocumentPartyData = {
      contrato: row.contrato,
      valor: row.capital,
      totalAPagar: row.capital + row.juro,
      prazo: row.prazo || pedido?.prazo || 1,
      taxa: pedido?.taxa || 30,
      frequencia: pedido?.frequencia || "Mensal",
      tipoCredito: row.carteira,
      dataDesembolso: row.dataDesembolso,
      dataAprovacao: row.dataAprovacao,
      aprovadoPor: row.aprovadoPor,
      autorizadoPor: row.autorizadoPor,
      desembolsadoPor: row.gestor,
      clienteId: row.clienteId,
      clienteNome: row.cliente,
      clienteTipo: client?.type || "singular",
      nuit: client?.nuit || "",
      documentType: client?.documentType || "BI (Bilhete de Identidade)",
      documentNumber: client?.documentNumber || "",
      birthDate: (client as any)?.birthDate || "",
      gender: (client as any)?.gender || "",
      maritalStatus: (client as any)?.maritalStatus || "Solteiro(a)",
      nationality: (client as any)?.nationality || "Moçambicana",
      province: (client as any)?.province || "",
      city: (client as any)?.city || (client as any)?.district || (client as any)?.province || "",
      district: (client as any)?.district || "",
      neighborhood: (client as any)?.neighborhood || "",
      addressLine: (client as any)?.addressLine || "",
      houseNumber: (client as any)?.houseNumber || "0",
      occupation: client?.occupation || row.ocupacao || "",
      employerName: client?.employerName || "",
      phone: client?.phone || row.contato || "",
      email: client?.email || "",
    };
    printDocumentoCredito(tipo, docData);
  };

  const handleDisburse = async () => {
    if (!selected) return;
    try {
      const res = await decidirPedido(selected.id, "approve", "Desembolso executado", true);

      // 1. Atualiza imediatamente o estado do pedido para sair da lista de pendentes no mesmo instante
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? {
                ...p,
                estado: "desembolsado",
                dataDesembolso: new Date().toLocaleDateString("pt-PT"),
                valorDesembolsado: selected.valor,
              }
            : p
        )
      );

      const newInstallments = generateInstallments(selected);
      const totalJuros = selected.valor * (selected.taxa / 100) * selected.prazo;
      const totalPagar = selected.valor + totalJuros;
      const contractNumber = res.contractNo || `CT-${new Date().getFullYear()}-${String(selected.id).padStart(4, "0")}`;

      const client = clients.find((c) => c.id === selected.clienteId);
      const newCreditItem: StoredCredito = {
        id: selected.id,
        pedidoId: selected.id,
        clienteId: selected.clienteId,
        cliente: selected.cliente,
        clienteType: selected.isGrupo ? "grupo" : "singular",
        contrato: contractNumber,
        valorSolicitado: selected.valor,
        totalAPagar: totalPagar,
        totalPago: 0,
        saldoDevedor: totalPagar,
        prazo: selected.prazo,
        taxa: selected.taxa,
        frequencia: selected.frequencia,
        estado: "ativo",
        mora: 0,
        prestacoesAtrasadas: 0,
        dataDesembolso: new Date().toLocaleDateString("pt-PT"),
        tipoCredito: client?.carteiraNome || selected.tipoCredito || "Geral",
        parcelas: newInstallments,
      };

      const existingCredits = loadCreditosDesembolsados();
      // Garante unicidade estrita por pedidoId e contrato (zero duplicações)
      const updatedCredits = [
        newCreditItem,
        ...existingCredits.filter(
          (c) => c.id !== selected.id && c.pedidoId !== selected.id && c.contrato !== contractNumber
        ),
      ];
      localStorage.setItem(CREDIT_STORAGE_KEY, JSON.stringify(updatedCredits));
      setCreditos(updatedCredits);

      toast.success(
        `Desembolso do Pedido #${selected.id} executado com sucesso! Contrato nº ${contractNumber} gerado e documentos emitidos.`
      );
      setActiveTab("desembolsados");
      setExpandedContract(contractNumber);
      setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao executar desembolso.");
    }
  };

  const handleExportInstallments = () => {
    if (!selected) return;
    const installments = generateInstallments(selected);
    const lines = [
      "PLANO DE PAGAMENTO",
      `Cliente: ${selected.cliente}`,
      `Contrato: CT-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      `Valor: ${formatCurrencyMT(selected.valor)}`,
      `Prazo: ${selected.prazo} meses`,
      `Taxa: ${selected.taxa}% ao mês`,
      `Frequência: ${selected.frequencia}`,
      "",
      "Parcela | Vencimento | Valor",
      ...installments.map((i) => `${i.numParcela} | ${i.dataVencimento} | ${formatCurrencyMT(i.valor)}`),
      "",
      `Total: ${formatCurrencyMT(installments.reduce((s, i) => s + i.valor, 0))}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
        a.download = `plano-pagamento-${selected.cliente.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const empresa = user?.companyName || "Tin Microcrédito";
    const hoje = new Date().toLocaleDateString("pt-PT");
    const hora = new Date().toLocaleTimeString("pt-PT");
    const periodo = dateFrom && dateTo ? `${ptDate(dateFrom)} - ${ptDate(dateTo)}` : "Todos os períodos";
    const carteiraLabel = filterCarteira === "all" ? "Todas" : filterCarteira;
    const gestorLabel = filterGestor === "all" ? "Todos" : filterGestor;

    // — Cabeçalho empresa —
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(empresa, 20, 18);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Moatize, En7, 1º Andar, Paragem Matchikitchiki", 20, 23);
    doc.text("Nuit: 117078361 | Email: hoyohoyomicrocredito1@gmail.com | Tel: 878591645", 20, 26.5);

    // — Título + metadados —
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("DESEMBOLSO", 20, 34);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Período: ${periodo}`, 20, 39);
    doc.text(`Carteira: ${carteiraLabel}`, 20, 42);
    doc.text(`Gestor: ${gestorLabel}`, 20, 45);
    doc.text(`Gerado: ${hoje} ${hora}`, 20, 48);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(20, 50, 190, 50);

    const headers = [[
      "Data", "Cliente", "Profissão", "Contato", "Gestor - Linha",
      "Preparo", "Seguro", "Imposto de Selo", "Taxa de Desembolso",
      "Capital", "Juro", "Nº Recibo",
    ]];

    const body: (string | number)[][] = desembolsadosFiltrados.length
      ? desembolsadosFiltrados.map((r) => [
          r.dataDesembolso,
          r.cliente,
          r.ocupacao,
          r.contato,
          r.gestor,
          r.preparo,
          r.seguro,
          r.imposto,
          r.taxaDesembolso,
          r.capital,
          r.juro,
          r.contrato,
        ])
      : [["—", "—", "—", "—", "—", 0, 0, 0, 0, 0, 0, "—"]];

    // Footer totals row
    const totalsRow: (string | number)[] = [
      "TOTAIS", "", "", "", "",
      reportTotals.preparo,
      reportTotals.seguro,
      reportTotals.imposto,
      reportTotals.taxa,
      reportTotals.capital,
      reportTotals.juro,
      `${desembolsadosFiltrados.length}`,
    ];
    body.push(totalsRow);

    autoTable(doc, {
      startY: 51,
      head: headers,
      body,
      theme: "grid",
      styles: { fontSize: 6.5, cellWidth: "wrap", halign: "left" },
      headStyles: { fillColor: [243, 238, 255], textColor: [71, 36, 194], fontSize: 6.5 },
      bodyStyles: { fontSize: 6.5 },
      didDrawPage: (data) => {
        const cursorY = (data as any).cursor?.y ?? 270;
        // Footer
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(`Desembolsos: ${desembolsadosFiltrados.length.toFixed(0)}`, 20, cursorY + 6);
        doc.setFont("helvetica", "bold");
        doc.text("CAPITALIZAÇÃO", 190, cursorY + 6, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.text(empresa, 190, cursorY + 11, { align: "right" });
      },
    });

    doc.save(`desembolso-${Date.now()}.pdf`);
  };

  if (!canView) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão para aceder ao desembolso.</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg">
          <DollarSign className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Desembolso</h1>
          <p className="text-sm text-slate-500">Liberação de fundos e criação do plano de pagamento</p>
        </div>
      </div>

      {success && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
          {success}
        </div>
      )}

      {/* Abas */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          <button
            onClick={() => { setActiveTab("pendentes"); setSelectedId(null); setSuccess(""); }}
            className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "pendentes"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            📋 Pendentes para Desembolso <span className="ml-1 text-xs opacity-70">({filtered.length})</span>
          </button>
          <button
            onClick={() => { setActiveTab("desembolsados"); setSelectedId(null); setSuccess(""); }}
            className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "desembolsados"
                ? "border-purple-500 text-purple-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            ✅ Desembolsados <span className="ml-1 text-xs opacity-70">({creditos.length})</span>
          </button>
        </nav>
      </div>

      {activeTab === "pendentes" ? (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista */}
        <div className="lg:col-span-1">
          <PipelineList
            pedidos={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            search={search}
            onSearchChange={setSearch}
            label="pedido(s) autorizados"
            emptyMessage="Nenhum pedido para desembolsar."
          />
        </div>

        {/* Detalhes */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">{selected.cliente}</h2>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${selected.clienteType === "singular" ? "bg-blue-100 text-blue-700" : selected.clienteType === "grupo" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {selected.clienteType === "singular" ? "Individual" : selected.clienteType === "grupo" ? "Grupo" : "Empresa"}
                </span>
              </div>

              <PedidoDetailCards pedido={selected} />
              <GrupoMembrosSection membros={selected.membros} />

              {/* Plano de pagamento preview */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> Plano de Pagamento ({selected.prazo} parcelas)
                </h3>
                <div className="max-h-40 overflow-y-auto text-xs">
                  {generateInstallments(selected).slice(0, 20).map((inst) => (
                    <div key={inst.numParcela} className="flex justify-between py-1 border-b border-slate-200 last:border-0">
                      <span className="text-slate-600">Parcela #{inst.numParcela}</span>
                      <span className="text-slate-700">{inst.dataVencimento}</span>
                      <span className="font-medium text-slate-800">{formatCurrencyMT(inst.valor)}</span>
                    </div>
                  ))}
                  {selected.prazo > 20 && (
                    <p className="text-slate-400 text-center py-1">...e mais {selected.prazo - 20} parcelas</p>
                  )}
                  <div className="flex justify-between py-1.5 font-semibold text-slate-800 border-t border-slate-300 mt-1">
                    <span>Total</span>
                    <span>{formatCurrencyMT(generateInstallments(selected).reduce((s, i) => s + i.valor, 0))}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handleDisburse}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm">
                  <CheckCircle2 className="w-4 h-4" /> Desembolsar & Criar Estado
                </button>
                <button onClick={handleExportInstallments}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  <Download className="w-4 h-4" /> Exportar Plano
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<DollarSign className="w-12 h-12" />}
              message="Selecione um pedido autorizado para desembolsar"
            />
          )}
        </div>
      </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-violet-50 border-b border-violet-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-violet-700" />
                <h3 className="font-semibold text-violet-900">Relatório de Desembolsos</h3>
              </div>
              <button
                onClick={handleExportPdf}
                disabled={desembolsadosFiltrados.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Exportar PDF
              </button>
            </div>
            <p className="text-xs text-violet-700 mt-1">Modelo Desembolso.pdf — filtragem por data, carteira e gestor</p>

            {/* Filtros */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
              <div><label className="block text-xs text-slate-500 mb-1">Data início</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full h-8 px-2 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-violet-400" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Data fim</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full h-8 px-2 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-violet-400" /></div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Carteira</label>
                <select
                  value={filterCarteira}
                  onChange={(e) => setFilterCarteira(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:ring-1 focus:ring-violet-400"
                >
                  <option value="all" className="bg-white text-slate-900">Todas as Carteiras ({carteiraOptions.length})</option>
                  {carteiraOptions.map((opt) => (
                    <option key={opt} value={opt} className="bg-white text-slate-900">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gestor</label>
                <select
                  value={filterGestor}
                  onChange={(e) => setFilterGestor(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:ring-1 focus:ring-violet-400"
                >
                  <option value="all" className="bg-white text-slate-900">Todos os Gestores ({gestorOptions.length})</option>
                  {gestorOptions.map((opt) => (
                    <option key={opt} value={opt} className="bg-white text-slate-900">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div><label className="block text-xs text-slate-500 mb-1">Cliente</label><input type="text" placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-8 px-2 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-violet-400" /></div>
            </div>
          </div>

          {/* Tabela modelo Desembolso.pdf */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Data</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Profissão</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Contato</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Gestor - Linha</th>
                  <th className="px-3 py-2 text-left font-medium text-emerald-600 uppercase">Aprovação</th>
                  <th className="px-3 py-2 text-left font-medium text-indigo-600 uppercase">Autorização</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Preparo</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Seguro</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Imposto</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Taxa</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Capital</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Juro</th>
                  <th className="px-3 py-2 text-right font-medium text-red-500 uppercase">Mora</th>
                  <th className="px-3 py-2 text-center font-medium text-red-500 uppercase">Atrasadas</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Nº Recibo</th>
                  <th className="px-3 py-2 text-center font-medium text-purple-700 uppercase">Documentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {desembolsadosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="px-3 py-6 text-center text-sm text-slate-500">
                      Nenhum desembolso encontrado para os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  desembolsadosFiltrados.map((r) => (
                    <>
                      <tr key={r.contrato} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 text-slate-600">{r.dataDesembolso || "—"}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.cliente}</td>
                        <td className="px-3 py-2 text-slate-600">{r.ocupacao || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{r.contato || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{r.gestor || "—"}</td>
                        <td className="px-3 py-2 text-xs text-emerald-700">{r.aprovadoPor ? `${r.aprovadoPor} (${r.dataAprovacao})` : "—"}</td>
                        <td className="px-3 py-2 text-xs text-indigo-700">{r.autorizadoPor ? `${r.autorizadoPor} (${r.dataAutorizacao})` : "—"}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.preparo)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.seguro)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.imposto)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.taxaDesembolso)}</td>
                        <td className="px-3 py-2 text-right text-slate-900 font-medium">{formatCurrency(r.capital)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.juro)}</td>
                        <td className={"px-3 py-2 text-right " + (r.mora > 0 ? "text-red-600 font-semibold" : "text-slate-400")}>{formatCurrency(r.mora)}</td>
                        <td className={"px-3 py-2 text-center " + (r.atrasadas > 0 ? "text-red-600 font-semibold" : "text-slate-400")}>{r.atrasadas}</td>
                        <td className="px-3 py-2 text-slate-600">{r.contrato}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedContract((prev) => (prev === r.contrato ? null : r.contrato))}
                            className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 mx-auto transition-colors shadow-sm ${
                              expandedContract === r.contrato
                                ? "bg-purple-700 text-white"
                                : "bg-purple-100 text-purple-800 hover:bg-purple-200"
                            }`}
                            title="Visualizar e Imprimir Contrato, Termos, Declarações e Recibos"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Docs</span>
                            {expandedContract === r.contrato ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>
                      </tr>

                      {expandedContract === r.contrato && (
                        <tr className="bg-purple-50/70 border-b border-purple-200">
                          <td colSpan={17} className="p-3.5">
                            <div className="space-y-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200 pb-2">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-purple-700" />
                                  <span className="font-bold text-xs text-purple-950 uppercase tracking-wide">
                                    Documentos Legais Gerados Pós-Desembolso — Contrato nº {r.contrato} ({r.cliente})
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("dossie_completo", r)}
                                  className="px-3 py-1.5 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-lg text-xs font-semibold shadow hover:from-purple-800 hover:to-indigo-800 flex items-center gap-1.5 transition-all"
                                >
                                  <Layers className="w-3.5 h-3.5" /> Imprimir Dossier Completo (7 Documentos)
                                </button>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("contrato", r)}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-left transition-all shadow-sm group"
                                >
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">1. Contrato Crédito</div>
                                  <div className="text-[10px] text-slate-500">Mútuo & Cláusulas</div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("confissao", r)}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-left transition-all shadow-sm group"
                                >
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">2. Confissão Dívida</div>
                                  <div className="text-[10px] text-slate-500">Título Executivo</div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("termo_bens", r)}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-left transition-all shadow-sm group"
                                >
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">3. Termo Bens</div>
                                  <div className="text-[10px] text-slate-500">Depósito & Penhor</div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("declaracao_garantia", r)}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-left transition-all shadow-sm group"
                                >
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">4. Decl. Garantia</div>
                                  <div className="text-[10px] text-slate-500">Titularidade Legal</div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("desconto_salarial", r)}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-left transition-all shadow-sm group"
                                >
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">5. Desconto Salário</div>
                                  <div className="text-[10px] text-slate-500">Autorização em Folha</div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("termo_compromisso", r)}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-left transition-all shadow-sm group"
                                >
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">6. Compromisso</div>
                                  <div className="text-[10px] text-slate-500">Termo de Honra</div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintDoc("recibo_desembolso", r)}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-left transition-all shadow-sm group"
                                >
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">7. Recibo Desembolso</div>
                                  <div className="text-[10px] text-slate-500">Comprovativo Entrega</div>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
                {desembolsadosFiltrados.length > 0 && (
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={7} className="px-3 py-2 text-slate-700">TOTAIS</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(reportTotals.preparo)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(reportTotals.seguro)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(reportTotals.imposto)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(reportTotals.taxa)}</td>
                    <td className="px-3 py-2 text-right text-violet-700">{formatCurrency(reportTotals.capital)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(reportTotals.juro)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{formatCurrency(reportTotals.mora)}</td>
                    <td className="px-3 py-2 text-center text-red-600">{reportTotals.atrasadas}</td>
                    <td className="px-3 py-2 text-slate-600">{desembolsadosFiltrados.length}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {desembolsadosFiltrados.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-600">Total de desembolsos: <strong className="text-slate-900">{desembolsadosFiltrados.length}</strong></span>
              <span className="text-slate-600">Capital total: <strong className="text-violet-700">{formatCurrencyMT(reportTotals.capital)}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
