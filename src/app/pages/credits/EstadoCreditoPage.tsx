import { useState, useEffect, useMemo } from "react";
import { Activity, Search, CreditCard, Calendar, DollarSign, AlertTriangle, RefreshCcw, Loader2, Users, CheckCircle2, XCircle, Printer, X, FileText, Layers } from "lucide-react";
import { openCorporatePrintWindow } from "../../lib/print";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { getTodosCreditos, useCreditosPolling } from "../../lib/credits";
import type { CreditoAtivo, Installment, Pedido } from "../../../../shared/types";
import { formatCurrencyMT, formatCurrency } from "../../lib/format";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { usePedidosPolling } from "../../lib/loans";
import { fetchClients, type ClientSummary } from "../../lib/clients";
import { printDocumentoCredito, type DocumentPartyData } from "../../lib/creditDocuments";
import ProcessTimeline from "../../components/process/ProcessTimeline";

type CreditState = "ativo" | "liquidado" | "atrasado";

type InstallmentRow = {
  id: number;
  numParcela: number;
  dataVencimento: string;
  valor: number;
  status: "pendente" | "pago" | "atrasado";
  dataPagamento: string | null;
  valorPago: number;
};

type CreditInfo = {
  id: number;
  clientId: number;
  clientName: string;
  clientType: string;
  groupName: string;
  groupLeader: string;
  groupDescription: string;
  contractNo: string;
  valorSolicitado: number;
  totalAPagar: number;
  totalPago: number;
  saldoDevedor: number;
  prazo: number;
  taxa: number;
  frequencia: string;
  estado: CreditState;
  mora: number;
  prestacoesAtrasadas: number;
  parcelas: InstallmentRow[];
};

const ESTADO_LABEL: Record<string, string> = {
  ativo: "Ativo",
  liquidado: "Liquidado",
  atrasado: "Em Atraso",
};

const ESTADO_COLOR: Record<string, string> = {
  ativo: "bg-blue-100 text-blue-700",
  liquidado: "bg-emerald-100 text-emerald-700",
  atrasado: "bg-red-100 text-red-700",
};

function resolveEstado(c: CreditoAtivo): CreditState {
  if (c.estado === "liquidado") return "liquidado";
  if ((c.prestacoesAtrasadas || 0) > 0) return "atrasado";
  return "ativo";
}

function toInstallmentRow(p: Installment): InstallmentRow {
  return {
    id: p.numParcela,
    numParcela: p.numParcela,
    dataVencimento: p.dataVencimento,
    valor: p.valor,
    status: p.status === "pago" ? "pago" : p.status === "atrasado" ? "atrasado" : "pendente",
    dataPagamento: p.dataPagamento ?? null,
    valorPago: p.valorPago ?? 0,
  };
}

function creditoToCreditInfo(c: CreditoAtivo): CreditInfo {
  const anyC = c as unknown as { grupoNome?: string; liderGrupo?: string; descricaoGrupo?: string };
  return {
    id: c.id,
    clientId: c.clienteId,
    clientName: c.cliente,
    clientType: c.clienteType,
    groupName: anyC.grupoNome ?? "",
    groupLeader: anyC.liderGrupo ?? "",
    groupDescription: anyC.descricaoGrupo ?? "",
    contractNo: c.contrato,
    valorSolicitado: c.valorSolicitado,
    totalAPagar: c.totalAPagar,
    totalPago: c.totalPago,
    saldoDevedor: c.saldoDevedor,
    prazo: c.prazo,
    taxa: c.taxa,
    frequencia: c.frequencia,
    estado: resolveEstado(c),
    mora: c.mora,
    prestacoesAtrasadas: c.prestacoesAtrasadas,
    parcelas: (c.parcelas || []).map(toInstallmentRow),
  };
}

export default function EstadoCreditoPage() {
  const user = getUser();
  const canView = hasPermission(user, "solicitar.credito");

  const [creditos, setCreditos] = useState<CreditoAtivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tabFiltro, setTabFiltro] = useState<"todos" | "ativo" | "liquidado">("todos");

  useEffect(() => {
    setCreditos(getTodosCreditos());
    const cleanup = useCreditosPolling((list) => { setCreditos(list); }, 3000);
    setLoading(false);
    return cleanup;
  }, []);

  const creditList = useMemo(() => {
    return [...creditos]
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .map(creditoToCreditInfo);
  }, [creditos]);

  const filtered = useMemo(() => {
    return creditList.filter((c) => {
      const matchSearch = c.clientName.toLowerCase().includes(search.toLowerCase());
      const matchTab = tabFiltro === "todos" || c.estado === tabFiltro;
      return matchSearch && matchTab;
    });
  }, [creditList, search, tabFiltro]);

  // --- Relatório de desembolsados (mesma estrutura do Desembolso) ---
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  useEffect(() => usePedidosPolling(setPedidos), []);
  useEffect(() => { fetchClients().then(setClients).catch(() => setClients([])); }, []);

  function toDateKeyEstado(s: string): string {
    if (!s) return "";
    const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (!m) return "";
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  const pedidoGestorMap = useMemo(() => {
    const map = new Map<number, string>();
    pedidos.forEach((p) => { if (p.desembolsadoPor) map.set(p.id, p.desembolsadoPor); });
    return map;
  }, [pedidos]);

  const pedidoInfoMap = useMemo(() => {
    const map = new Map<number, Pedido>();
    pedidos.forEach((p) => map.set(p.id, p));
    return map;
  }, [pedidos]);


  type EstadoRow = {
    credito: CreditoAtivo; info: ReturnType<typeof creditoToCreditInfo>;
    dateKey: string; gestor: string; carteira: string; contato: string;
    dataAprovacao: string; aprovadoPor: string; dataAutorizacao: string; autorizadoPor: string;
  };

  const estadoRows = useMemo<EstadoRow[]>(() => creditList.map((info) => {
    const raw = creditos.find((c) => c.id === info.id);
    const client = clients.find((cl) => cl.id === info.clientId);
    return {
      credito: raw!, info,
      dateKey: toDateKeyEstado((raw as { dataDesembolso?: string })?.dataDesembolso || ""),
      gestor: (raw?.pedidoId ? pedidoGestorMap.get(raw.pedidoId) : "") || "",
      dataAprovacao: pedidoInfoMap.get(raw?.pedidoId ?? -1)?.dataAprovacao || "",
      aprovadoPor: pedidoInfoMap.get(raw?.pedidoId ?? -1)?.aprovadoPor || "",
      dataAutorizacao: pedidoInfoMap.get(raw?.pedidoId ?? -1)?.dataAutorizacao || "",
      autorizadoPor: pedidoInfoMap.get(raw?.pedidoId ?? -1)?.autorizadoPor || "",
      carteira: (raw as unknown as { tipoCredito?: string })?.tipoCredito || "—",
      contato: client?.phone || "",
    };
  }), [creditList, creditos, clients, pedidoGestorMap]);

  const estadoFiltrados = useMemo(() => estadoRows.filter((r) => {
    return !search || (r.info.clientName || "").toLowerCase().includes(search.toLowerCase());
  }), [estadoRows, search]);

  const selected = useMemo(() => creditList.find((c) => c.id === selectedId) || null, [creditList, selectedId]);

  // --- Imprimir (modelo ESTADO DO CREDITO via janela corporativa) ---
  const handlePrintEstado = (row: EstadoRow) => {
    const c = row.info;
    const raw = row.credito as CreditoAtivo & { dataDesembolso?: string };
    const now = new Date().toLocaleString("pt-PT");
    const rr = c.taxa / 100;
    const hoje = new Date();

    const esc = (s: unknown) => String(s ?? "-").replace(/</g, "&lt;");
    const money = (v: number) => formatCurrency(v);

    const prevRows = c.parcelas.map((p) => {
      const juro = Math.max(0, p.valor - p.valor / (1 + rr));
      return `<tr><td>${p.numParcela}</td><td>${esc(p.dataVencimento)}</td><td style='text-align:right'>${money(p.valor - juro)}</td><td style='text-align:right'>${money(juro)}</td><td style='text-align:right'>${money(p.valor)}</td></tr>`;
    }).join("");

    const pagoRows = c.parcelas.filter((p) => p.status === "pago").map((p) =>
      `<tr><td>${p.numParcela}</td><td>${esc(p.dataPagamento || p.dataVencimento)}</td><td style='text-align:right'>${money(c.mora > 0 && p.numParcela <= c.prestacoesAtrasadas ? c.mora : 0)}</td><td style='text-align:right'>${money(p.valor * 0.85)}</td><td style='text-align:right'>${money(p.valor * 0.15)}</td><td style='text-align:right'>${money(p.valorPago || p.valor)}</td></tr>`
    ).join("") || "<tr><td colspan='6'>Sem pagamentos registados.</td></tr>";

    const vigRows = c.parcelas.filter((p) => p.status !== "pago").map((p) => {
      const m = String(p.dataVencimento).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
      let dias = 0;
      if (m) {
        const yy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        const venc = new Date(yy, Number(m[2]) - 1, Number(m[1]));
        dias = venc < hoje ? Math.floor((hoje.getTime() - venc.getTime()) / 86400000) : 0;
      }
      const juro = Math.max(0, p.valor - p.valor / (1 + rr));
      return `<tr><td>${p.numParcela}</td><td>${esc(p.dataVencimento)}</td><td style='text-align:center'>${dias}</td><td style='text-align:right'>${money(p.valor - juro)}</td><td style='text-align:right'>${money(juro)}</td><td style='text-align:right'>${money(p.valor)}</td></tr>`;
    }).join("") || "<tr><td colspan='6'>Sem parcelas em aberto.</td></tr>";

    const html = `
      <div class="title">ESTADO DO CRÉDITO</div>
      <div class="muted"><strong>Cliente:</strong> ${c.clientId} | <strong>Crédito:</strong> 1 | <strong>Processo:</strong> ${new Date().getFullYear()}/1/${String(c.clientId).padStart(2, "0")}</div>
      <div class="muted"><strong>Nome:</strong> ${esc(c.clientName)} | ${esc(row.contato)}</div>
      <div class="muted"><strong>Gestor:</strong> ${esc(row.gestor)} | <strong>Avalista:</strong> SEM AVALISTA</div>
      <div class="muted"><strong>Linha:</strong> ${esc(row.carteira)} | <strong>Taxa:</strong> ${c.taxa}%</div>
      <div class="muted"><strong>Desembolso:</strong> ${money(c.valorSolicitado)} MT | <strong>Data:</strong> ${esc(raw?.dataDesembolso)}</div>
      <div class="block">
        <h2>PREVISTO</h2>
        <table><thead><tr><th>Nº</th><th>Vencimento</th><th>Capital</th><th>Juro</th><th>Prestação</th></tr></thead>
        <tbody>${prevRows}</tbody>
        <tfoot><tr><td colspan="4">TOTAL (${c.parcelas.length} prestações)</td><td style='text-align:right'><strong>${money(c.totalAPagar)}</strong></td></tr></tfoot></table>
      </div>
      <div class="block">
        <h2>PAGO</h2>
        <table><thead><tr><th>Nº</th><th>Pagamento</th><th>Mora</th><th>Capital</th><th>Juro</th><th>Total</th></tr></thead>
        <tbody>${pagoRows}</tbody>
        <tfoot><tr><td colspan="5">TOTAL PAGO</td><td style='text-align:right'><strong>${money(c.totalPago)}</strong></td></tr></tfoot></table>
      </div>
      <div class="block">
        <h2>VIGENTE</h2>
        <table><thead><tr><th>Nº</th><th>Vencimento</th><th>Dias Atraso</th><th>Capital</th><th>Juro</th><th>Total.Vigente</th></tr></thead>
        <tbody>${vigRows}</tbody></table>
      </div>
      <p class="muted">Saldo Devedor: <strong>${money(c.saldoDevedor)} MT</strong> | Gerado: ${now}</p>
    `;

    openCorporatePrintWindow({
      title: `Estado_Credito_${(c.contractNo || c.id).toString().replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      bodyHtml: html,
      company: user?.companyName ? { name: user.companyName } : undefined,
    });
  };

  const handlePrintDocEstado = (
    tipo: "contrato" | "confissao" | "termo_bens" | "declaracao_garantia" | "desconto_salarial" | "termo_compromisso" | "recibo_desembolso" | "dossie_completo",
    creditInfo: CreditInfo
  ) => {
    const raw = creditos.find((c) => c.id === creditInfo.id);
    const client = clients.find((c) => c.id === creditInfo.clientId);
    const pedido = pedidos.find((p) => p.id === (raw?.pedidoId));
    const docData: DocumentPartyData = {
      contrato: creditInfo.contractNo || `CT-${creditInfo.id}`,
      valor: creditInfo.valorSolicitado,
      totalAPagar: creditInfo.totalAPagar,
      prazo: creditInfo.prazo || pedido?.prazo || 1,
      taxa: creditInfo.taxa || 5,
      frequencia: creditInfo.frequencia || "Mensal",
      tipoCredito: (raw as any)?.tipoCredito || "Crédito Individual",
      dataDesembolso: (raw as any)?.dataDesembolso || "",
      dataAprovacao: pedido?.dataAprovacao || "",
      aprovadoPor: pedido?.aprovadoPor || "",
      autorizadoPor: pedido?.autorizadoPor || "",
      desembolsadoPor: pedido?.desembolsadoPor || "",
      clienteId: creditInfo.clientId,
      clienteNome: creditInfo.clientName,
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
      occupation: client?.occupation || "",
      employerName: client?.employerName || "",
      phone: client?.phone || "",
      email: client?.email || "",
    };
    printDocumentoCredito(tipo, docData);
  };

  // --- Exportar PDF no modelo "ESTADO DO CREDITO" ---
  const handleExportEstadoPdf = (row: EstadoRow) => {
    const c = row.info;
    const raw = row.credito as CreditoAtivo & { dataDesembolso?: string };
    const doc = new jsPDF("p", "mm", "a4");
    const empresa = user?.companyName || "Tin Microcrédito";

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(empresa, 14, 16);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Moatize En7, 1º Andar, Paragem Matchikitchiki | Nuit 117078361", 14, 20);
    doc.text("hoyohoyomicrocredito1@gmail.com | 878591645", 14, 23.5);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("ESTADO DO CRÉDITO", 105, 32, { align: "center" });

    const ano = new Date().getFullYear();
    const numSeq = String(c.clientId).padStart(2, "0");
    doc.setFontSize(8.5);
    doc.text(`Cliente: ${c.clientId} | Crédito: 1 | Processo: ${ano}/1/${numSeq}`, 14, 39);
    doc.text(`Nome: ${c.clientName}  |  ${row.contato || "-"}`, 14, 44);
    doc.text(`Gestor: ${row.gestor || "-"}   Avalista: SEM AVALISTA`, 14, 49);
    doc.text(`Linha: ${row.carteira}   Taxa: ${c.taxa}%`, 14, 54);
    doc.text(`Desembolso: ${formatCurrency(c.valorSolicitado)}   Data: ${raw?.dataDesembolso || "-"}`, 14, 59);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 62, 196, 62);

    const r = c.taxa / 100;
    const parcelas = c.parcelas;
    const hoje = new Date();

    // PREVISTO
    const prevRows = parcelas.map((p) => {
      const juro = Math.max(0, p.valor - p.valor / (1 + r));
      const capital = p.valor - juro;
      return [p.numParcela, p.dataVencimento, formatCurrency(capital), formatCurrency(juro), formatCurrency(p.valor), ""];
    });
    autoTable(doc, {
      startY: 66,
      head: [["PREVISTO", "", "", "", "", ""]],
      body: [],
      theme: "plain",
      headStyles: { fillColor: [34, 197, 214], textColor: 255, fontSize: 8, halign: "left" },
    });

    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
    autoTable(doc, {
      startY: y,
      head: [["Nº", "Vencimento", "Capital", "Juro", "Prestação", "Saldo.C"]],
      body: prevRows.length ? prevRows : [["-", "-", "-", "-", "-", "-"]],
      theme: "grid",
      styles: { fontSize: 7 },
      headStyles: { fillColor: [240, 249, 255], textColor: [15, 65, 90], fontSize: 7 },
      foot: [[`TOTAIS ${parcelas.length} prestações`, "", "", "", formatCurrency(c.totalAPagar), formatCurrency(c.saldoDevedor)]],
      footStyles: { fillColor: [226, 232, 240], textColor: 30, fontSize: 7 },
    });

    // PAGO
    const pagas = parcelas.filter((p) => p.status === "pago");
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    autoTable(doc, {
      startY: y,
      head: [["PAGO", "", "", "", "", "", "", "", "", ""]],
      body: [],
      theme: "plain",
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontSize: 8 },
    });
    y += 2;
    const pagoRows = pagas.map((p) => [
      p.numParcela, p.dataPagamento || p.dataVencimento, 0, formatCurrency(0), 0, formatCurrency(c.mora > 0 && p.numParcela <= c.prestacoesAtrasadas ? c.mora : 0),
      formatCurrency(p.valor * 0.85), formatCurrency(p.valor * 0.15), formatCurrency(0), formatCurrency(p.valorPago || p.valor),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Nº", "Pagamento", "Perdão.D", "Perdão.M", "Atraso", "Mora", "Capital", "Juro", "Custos", "Total"]],
      body: pagoRows.length ? pagoRows : [["-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]],
      theme: "grid",
      styles: { fontSize: 6.5 },
      headStyles: { fillColor: [240, 253, 244], textColor: [20, 83, 45], fontSize: 6.5 },
      foot: [[pagas.length ? "TOTAL" : "", "", "", "", "", "", "", "", "", formatCurrency(c.totalPago)]],
      footStyles: { fillColor: [226, 232, 240], fontSize: 6.5 },
    });

    // VIGENTE (atraso)
    const vigentes = parcelas.filter((p) => p.status !== "pago");
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    autoTable(doc, {
      startY: y,
      head: [["VIGENTE", "", "", "", "", "", "", "", "", ""]],
      body: [],
      theme: "plain",
      headStyles: { fillColor: [202, 138, 4], textColor: 255, fontSize: 8 },
    });
    y += 2;
    const vigRows = vigentes.map((p) => {
      const m = String(p.dataVencimento).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
      let dias = 0;
      if (m) {
        const yy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        const venc = new Date(yy, Number(m[2]) - 1, Number(m[1]));
        dias = venc < hoje ? Math.floor((hoje.getTime() - venc.getTime()) / 86400000) : 0;
      }
      const juro = Math.max(0, p.valor - p.valor / (1 + r));
      const capital = p.valor - juro;
      return [p.numParcela, p.dataVencimento, dias, formatCurrency(0), formatCurrency(0), formatCurrency(capital), formatCurrency(juro), formatCurrency(0), formatCurrency(0), formatCurrency(p.valor)];
    });
    autoTable(doc, {
      startY: y,
      head: [["Nº", "Vencimento", "Dias Atraso", "Mora Por Dia", "Mora.Montante", "Capital", "Juro", "Custo Diário", "Custo Total", "Total.Vigente"]],
      body: vigRows.length ? vigRows : [["-", "-", 0, "-", "-", "-", "-", "-", "-", "-"]],
      theme: "grid",
      styles: { fontSize: 6.5 },
      headStyles: { fillColor: [254, 249, 195], textColor: [120, 53, 15], fontSize: 6.5 },
    });

    doc.save(`estado-credito-${c.contractNo || c.id}.pdf`);
  };

  if (!canView) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão para aceder ao estado do crédito.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl shadow-lg">
          <Activity className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estado do Crédito</h1>
          <p className="text-sm text-slate-500">Acompanhamento completo do ciclo de vida do crédito</p>
        </div>
      </div>

      {/* Filtros do relatório de desembolsados */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Pesquisar pelo nome do cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-1 focus:ring-cyan-400" />
          </div>
          <span className="text-xs text-slate-500">{estadoFiltrados.length} cliente(s)</span>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Data</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Cliente</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Contato</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Gestor</th>
                  <th className="px-3 py-2 text-left font-medium text-emerald-600 uppercase">Aprovação</th>
                  <th className="px-3 py-2 text-left font-medium text-indigo-600 uppercase">Autorização</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Carteira</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Desembolso</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Pago</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500 uppercase">Saldo</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase">Estado</th>
                <th className="px-3 py-2 text-center font-medium text-slate-500 uppercase">Estado PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {estadoFiltrados.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-sm text-slate-500">Nenhum cliente desembolsado para os filtros aplicados.</td></tr>
              ) : estadoFiltrados.map((r) => (
                <tr key={r.info.id} className={`hover:bg-slate-50 cursor-pointer ${selectedId === r.info.id ? "bg-cyan-50" : ""}`} onClick={() => setSelectedId(r.info.id)}>
                  <td className="px-3 py-2 text-slate-600">{(r.credito as { dataDesembolso?: string }).dataDesembolso || "—"}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.info.clientName}</td>
                  <td className="px-3 py-2 text-slate-600">{r.contato || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.gestor || "—"}</td>
                      <td className="px-3 py-2 text-xs text-emerald-700">{r.aprovadoPor ? `${r.aprovadoPor} (${r.dataAprovacao})` : "—"}</td>
                      <td className="px-3 py-2 text-xs text-indigo-700">{r.autorizadoPor ? `${r.autorizadoPor} (${r.dataAutorizacao})` : "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.carteira}</td>
                  <td className="px-3 py-2 text-right text-slate-900 font-medium">{formatCurrency(r.info.valorSolicitado)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(r.info.totalPago)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.info.saldoDevedor)}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[r.info.estado]}`}>{ESTADO_LABEL[r.info.estado]}</span></td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={(e) => { e.stopPropagation(); handleExportEstadoPdf(r); }} className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-600 text-white rounded-md text-[11px] font-medium hover:bg-cyan-700 transition-colors">
                      <Printer className="w-3 h-3" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />A carregar...</div>}

      {/* Historico do cliente - modal */}
      {selected && (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setSelectedId(null)}>
        <div className="w-full max-w-5xl my-8 rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 rounded-t-xl px-6 py-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Estado do Crédito</h2>
              <p className="text-sm text-slate-500">{selected.clientName} · {selected.contractNo}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const r = estadoRows.find((x) => x.info.id === selected.id); if (r) handlePrintEstado(r); }}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              <button
                onClick={() => { const r = estadoRows.find((x) => x.info.id === selected.id); if (r) handleExportEstadoPdf(r); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-700 transition-colors"
              >
                Salvar em PDF
              </button>
              <button
                onClick={() => setSelectedId(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
            <div className="space-y-4 p-6">
              {/* Cabeçalho do cliente */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">{selected.clientName}</h2>
                    <p className="text-sm text-slate-500">{selected.contractNo}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${ESTADO_COLOR[selected.estado]}`}>
                    {ESTADO_LABEL[selected.estado]}
                  </span>
                </div>

                {/* Info grupo */}
                {selected.clientType === "grupo" && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2 text-indigo-700 font-medium text-sm mb-1">
                      <Users className="w-4 h-4" />{selected.groupName || "Grupo"}
                    </div>
                    <p className="text-xs text-indigo-600">Líder: {selected.groupLeader || "—"}</p>
                    {selected.groupDescription && (
                      <p className="text-xs text-indigo-500 mt-1">{selected.groupDescription}</p>
                    )}
                  </div>
                )}

                {/* Cards resumo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <CreditCard className="w-4 h-4 text-slate-400 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Saldo Devedor</p>
                    <p className="text-lg font-bold text-slate-800">{formatCurrencyMT(selected.saldoDevedor)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <DollarSign className="w-4 h-4 text-emerald-500 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Pago</p>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrencyMT(selected.totalPago)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <AlertTriangle className="w-4 h-4 text-red-500 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Mora</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrencyMT(selected.mora)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <Calendar className="w-4 h-4 text-amber-500 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Atrasadas</p>
                    <p className="text-lg font-bold text-amber-600">{selected.prestacoesAtrasadas}</p>
                  </div>
                </div>
              </div>

              {/* Tabela de parcelas */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-700 text-sm">Plano de Pagamento</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Pago</span>
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Atrasado</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" />Pendente</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-2.5 text-left font-medium text-slate-600">#</th>
                        <th className="px-4 py-2.5 text-left font-medium text-slate-600">Vencimento</th>
                        <th className="px-4 py-2.5 text-right font-medium text-slate-600">Valor (MT)</th>
                        <th className="px-4 py-2.5 text-center font-medium text-slate-600">Status</th>
                        <th className="px-4 py-2.5 text-left font-medium text-slate-600">Data Pag.</th>
                        <th className="px-4 py-2.5 text-right font-medium text-slate-600">Valor Pago</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.parcelas.map((p) => {
                        const statusColor = p.status === "pago" ? "text-emerald-600 bg-emerald-50"
                          : p.status === "atrasado" ? "text-red-600 bg-red-50"
                          : "text-slate-600 bg-slate-50";
                        const statusIcon = p.status === "pago" ? <CheckCircle2 className="w-3.5 h-3.5" />
                          : p.status === "atrasado" ? <XCircle className="w-3.5 h-3.5" />
                          : <Calendar className="w-3.5 h-3.5" />;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-700">{p.numParcela}</td>
                            <td className="px-4 py-2 text-slate-700">{p.dataVencimento}</td>
                            <td className="px-4 py-2 text-right text-slate-700">{formatCurrencyMT(p.valor)}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                                {statusIcon}{p.status === "pago" ? "Pago" : p.status === "atrasado" ? "Atrasado" : "Pendente"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-600">{p.dataPagamento || "—"}</td>
                            <td className="px-4 py-2 text-right font-medium text-slate-700">
                              {p.valorPago > 0 ? formatCurrencyMT(p.valorPago) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-100 font-semibold">
                        <td className="px-4 py-2 text-slate-900" colSpan={2}>Total</td>
                        <td className="px-4 py-2 text-right text-slate-900">{formatCurrencyMT(selected.totalAPagar)}</td>
                        <td colSpan={2} />
                        <td className="px-4 py-2 text-right text-emerald-700">{formatCurrencyMT(selected.totalPago)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detalhes do contrato */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <RefreshCcw className="w-4 h-4" /> Detalhes do Contrato
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Contrato</p>
                    <p className="font-medium text-slate-800">{selected.contractNo}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Valor Solicitado</p>
                    <p className="font-medium text-slate-800">{formatCurrencyMT(selected.valorSolicitado)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Prazo</p>
                    <p className="font-medium text-slate-800">{selected.prazo} meses</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Taxa</p>
                    <p className="font-medium text-slate-800">{selected.taxa}% ao mês</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Frequência</p>
                    <p className="font-medium text-slate-800">{selected.frequencia}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Total a Pagar</p>
                    <p className="font-medium text-slate-800">{formatCurrencyMT(selected.totalAPagar)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Total Pago</p>
                    <p className="font-medium text-emerald-700">{formatCurrencyMT(selected.totalPago)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Saldo Devedor</p>
                    <p className="font-medium text-slate-800">{formatCurrencyMT(selected.saldoDevedor)}</p>
                  </div>
                </div>
              </div>

              {/* Documentos Oficiais Pós-Desembolso */}
              <div className="bg-white border border-purple-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-700" />
                    <h3 className="text-sm font-bold text-purple-950 uppercase tracking-wide">
                      Documentos Legais Gerados Pós-Desembolso (Contrato nº {selected.contractNo})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("dossie_completo", selected)}
                    className="px-3 py-1.5 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-lg text-xs font-semibold shadow hover:from-purple-800 hover:to-indigo-800 flex items-center gap-1.5 transition-all"
                  >
                    <Layers className="w-3.5 h-3.5" /> Imprimir Dossier Completo (7 Documentos)
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("contrato", selected)}
                    className="p-2.5 bg-purple-50/40 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-100/60 text-left transition-all shadow-sm group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">1. Contrato Crédito</div>
                    <div className="text-[10px] text-slate-500">Mútuo & Cláusulas</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("confissao", selected)}
                    className="p-2.5 bg-purple-50/40 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-100/60 text-left transition-all shadow-sm group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">2. Confissão Dívida</div>
                    <div className="text-[10px] text-slate-500">Título Executivo</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("termo_bens", selected)}
                    className="p-2.5 bg-purple-50/40 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-100/60 text-left transition-all shadow-sm group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">3. Termo Bens</div>
                    <div className="text-[10px] text-slate-500">Depósito & Penhor</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("declaracao_garantia", selected)}
                    className="p-2.5 bg-purple-50/40 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-100/60 text-left transition-all shadow-sm group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">4. Decl. Garantia</div>
                    <div className="text-[10px] text-slate-500">Titularidade Legal</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("desconto_salarial", selected)}
                    className="p-2.5 bg-purple-50/40 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-100/60 text-left transition-all shadow-sm group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">5. Desconto Salário</div>
                    <div className="text-[10px] text-slate-500">Autorização em Folha</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("termo_compromisso", selected)}
                    className="p-2.5 bg-purple-50/40 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-100/60 text-left transition-all shadow-sm group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">6. Compromisso</div>
                    <div className="text-[10px] text-slate-500">Termo de Honra</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintDocEstado("recibo_desembolso", selected)}
                    className="p-2.5 bg-purple-50/40 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-100/60 text-left transition-all shadow-sm group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-purple-800">7. Recibo Desembolso</div>
                    <div className="text-[10px] text-slate-500">Comprovativo Entrega</div>
                  </button>
                </div>
              </div>

              <ProcessTimeline clientId={selected.clientId} />
            </div>
        </div>
      </div>
      )}
    </div>
  );
}