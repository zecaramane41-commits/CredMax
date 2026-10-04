import { useState, useEffect, useCallback } from "react";
import { Download, Plus, Printer, Building2 } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { formatCurrencyMT } from "../../lib/format";
import { apiFetch } from "../../lib/api";

type AmortizationRow = {
  period: number;
  dueDate: string;
  capital: number;
  interest: number;
  installment: number;
  balance: number;
};

type AmortizationSystem = "price" | "sac";
type Frequency = "monthly" | "biweekly" | "weekly" | "daily";
type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type CompanyProfile = {
  id: number;
  name: string;
  legalName: string;
  nuit: string;
  phone: string;
  email: string;
  address: string;
  logoUrl: string;
  ownerName: string;
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getNextInstallmentDate(current: Date, freq: Frequency): Date {
  const next = new Date(current);
  if (freq === "weekly") next.setDate(next.getDate() + 7);
  else if (freq === "biweekly") next.setDate(next.getDate() + 15);
  else if (freq === "daily") next.setDate(next.getDate() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function getNumInstallments(freq: Frequency, termMonths: number, selectedWeekDays: WeekDay[]): number {
  if (freq === "daily") {
    const daysPerWeek = selectedWeekDays.length > 0 ? selectedWeekDays.length : 7;
    const totalDays = Math.round(termMonths * 30);
    return Math.max(1, Math.round(totalDays * (daysPerWeek / 7)));
  }
  if (freq === "weekly") return termMonths * 4;
  if (freq === "biweekly") return termMonths * 2;
  return termMonths;
}

export default function SimulatorPage() {
  const user = getUser();
  const canSimulate = hasPermission(user, "solicitar.credito");

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [capital, setCapital] = useState<number | null>(null);
  const [termMonths, setTermMonths] = useState<number>(1);
  const [rate, setRate] = useState<number>(30);
  const [system, setSystem] = useState<AmortizationSystem>("price");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [selectedWeekDays, setSelectedWeekDays] = useState<WeekDay[]>([1, 2, 3, 4, 5, 6, 0]);
  const [schedule, setSchedule] = useState<AmortizationRow[]>([]);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    apiFetch<{ company: CompanyProfile }>("/company/profile")
      .then((data) => setCompany(data.company))
      .catch(() => {});
  }, []);

  const cap = capital ?? 0;
  const monthlyRateDecimal = rate / 100;
  const numInstallments = getNumInstallments(frequency, termMonths, selectedWeekDays);
  const totalInterest = cap * monthlyRateDecimal * termMonths;
  const totalToPay = cap + totalInterest;
  const installmentValue = numInstallments > 0 ? totalToPay / numInstallments : 0;
  const frequencyLabel = frequency === "daily" ? "Diário" : frequency === "weekly" ? "Semanal" : frequency === "biweekly" ? "Quinzenal" : "Mensal";

  const handleSimulate = () => {
    if (capital <= 0 || termMonths <= 0) return;
    const rows: AmortizationRow[] = [];
    let balance = capital;
    let date = new Date();
    for (let i = 1; i <= numInstallments; i++) {
      date = getNextInstallmentDate(date, frequency);
      const interest = balance * monthlyRateDecimal;
      const amort = installmentValue - interest;
      balance -= amort;
      rows.push({ period: i, dueDate: formatDate(date), capital: Math.max(0, amort), interest, installment: installmentValue, balance: Math.max(balance, 0) });
    }
    setSchedule(rows);
    setShowTable(true);
  };

  const handleClear = () => {
    setCapital(null); setTermMonths(1); setRate(30); setSystem("price"); setFrequency("monthly");
    setSelectedWeekDays([1, 2, 3, 4, 5, 6, 0]); setSchedule([]); setShowTable(false);
  };

  const toggleWeekDay = (day: WeekDay) => {
    setSelectedWeekDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b));
  };

  // Shared PDF builder — used for both Export PDF and Imprimir
  const buildPDF = useCallback(async () => {
    if (schedule.length === 0) return null;
    let companyData = company;
    if (!companyData) {
      try { const data = await apiFetch<{ company: CompanyProfile }>("/company/profile"); companyData = data.company; } catch {}
    }
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 14;
    const cw = pw - m * 2;
    const now = new Date();
    const simN = `SIM-${now.getFullYear()}-${String(now.getTime()).slice(-7)}`;

    // HEADER
    doc.setFillColor(30, 30, 30);
    doc.rect(m, m, cw, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(companyData?.name || "MICROCREDITO", m + 4, m + 10);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    let hl = m + 18;
    if (companyData?.nuit) { doc.text(`NUIT: ${companyData.nuit}`, m + 4, hl); hl += 4; }
    if (companyData?.address) { doc.text(`Endereço: ${companyData.address}`, m + 4, hl); hl += 4; }
    doc.text(`Tel: ${companyData?.phone || "---"}  |  Email: ${companyData?.email || "---"}`, m + 4, hl);
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(`Nº ${simN}`, pw - m - 4, m + 10, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.text(`Data: ${formatDate(now)}`, pw - m - 4, m + 16, { align: "right" });

    // TITLE
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("SIMULAÇÃO DE CRÉDITO", pw / 2, m + 48, { align: "center" });

    // PARAMS
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
    doc.text([`Taxa: ${rate}% a.m.`, `Prazo: ${termMonths} meses`, `Frequência: ${frequencyLabel}`, `${system === "price" ? "PRICE" : "SAC"}`, `${numInstallments}×`].join("  ·  "), pw / 2, m + 55, { align: "center" });

    // SUMMARY CARDS
    const cy = m + 64; const cw2 = cw / 4 - 3; const ch = 20;
    const items: { label: string; value: string; color: [number, number, number] }[] = [
      { label: "Valor Solicitado", value: formatCurrencyMT(capital), color: [59, 130, 246] },
      { label: "Prestação Estimada", value: formatCurrencyMT(installmentValue), color: [16, 185, 129] },
      { label: "Juros Totais", value: formatCurrencyMT(totalInterest), color: [245, 158, 11] },
      { label: "Total a Pagar", value: formatCurrencyMT(totalToPay), color: [30, 30, 30] },
    ];
    items.forEach((item, idx) => {
      const x = m + idx * (cw2 + 4);
      doc.setFillColor(item.color[0], item.color[1], item.color[2]);
      doc.roundedRect(x, cy, cw2, ch, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6); doc.setFont("helvetica", "bold");
      doc.text(item.label, x + cw2 / 2, cy + 7, { align: "center" });
      doc.setFontSize(9);
      doc.text(item.value, x + cw2 / 2, cy + 16, { align: "center" });
    });

    // TABLE
    const td = schedule.map((r) => [String(r.period), r.dueDate, formatCurrencyMT(r.capital), formatCurrencyMT(r.interest), formatCurrencyMT(r.installment), formatCurrencyMT(r.balance)]);
    const totalPaid = schedule.reduce((s, r) => s + r.installment, 0);
    const totalIntPaid = totalPaid - capital;
    autoTable(doc, {
      startY: cy + ch + 10,
      head: [["Parcela", "Vencimento", "Capital", "Juros", "Prestação", "Saldo Devedor"]],
      body: td,
      foot: [["Total", `${numInstallments}×`, formatCurrencyMT(capital), formatCurrencyMT(totalIntPaid), formatCurrencyMT(totalPaid), "0,00"]],
      theme: "grid",
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 0: { cellWidth: 16, halign: "center" }, 1: { cellWidth: 28, halign: "center" }, 2: { cellWidth: "auto", halign: "right" }, 3: { cellWidth: "auto", halign: "right" }, 4: { cellWidth: "auto", halign: "right" }, 5: { cellWidth: "auto", halign: "right" } },
      margin: { left: m, right: m },
    });

    // FOOTER
    const lastTbl = (doc as any).lastAutoTable;
    const fy = lastTbl ? lastTbl.finalY + 10 : ph - 30;
    doc.setDrawColor(200, 200, 200); doc.line(m, fy, pw - m, fy);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 120, 120);
    doc.text(companyData?.name || "MICROCREDITO", m, fy + 5);
    doc.text(`Endereço: ${companyData?.address || "---"}`, m, fy + 9);
    doc.text(`Tel: ${companyData?.phone || "---"}  |  Email: ${companyData?.email || "---"}`, m, fy + 13);
    doc.text("Data de Impressão:", pw - m, fy + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatDate(now), pw - m, fy + 9, { align: "right" });

    const fn = `simulacao-credito-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.pdf`;
    return { doc, filename: fn };
  }, [schedule, capital, rate, termMonths, frequencyLabel, system, frequency, numInstallments, installmentValue, totalInterest, totalToPay, company]);

  // Export PDF → download file
  const handleExportPDF = useCallback(async () => {
    const result = await buildPDF();
    if (result) result.doc.save(result.filename);
  }, [buildPDF]);

  // Imprimir → open PDF in new window and print
  const handlePrint = useCallback(async () => {
    const result = await buildPDF();
    if (result) {
      const blob = result.doc.output("blob");
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        w.onload = () => { w.print(); URL.revokeObjectURL(url); };
        // Fallback if onload doesn't fire
        setTimeout(() => { URL.revokeObjectURL(url); }, 10000);
      }
    }
  }, [buildPDF]);

  if (!canSimulate) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão para acessar o simulador.</p></div>;
  }

  const totalPaid = schedule.reduce((sum, row) => sum + row.installment, 0);
  const totalInterestPaid = totalPaid - capital;

  return (
    <div className="min-h-screen bg-white">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center">
              {company?.logoUrl ? <img src={company.logoUrl} alt="Logo" className="w-12 h-12 object-contain" /> : <Building2 className="w-8 h-8 text-slate-800" />}
            </div>
            <div>
              <h1 className="text-3xl font-bold">SIMULAÇÃO DE CRÉDITO</h1>
              <p className="text-sm text-slate-300">{company?.name || "Soluções Financeiras"}</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{company?.name || ""}</p>
            <p className="text-slate-300">{company?.nuit ? `NUIT: ${company.nuit}` : ""}</p>
            <p className="text-slate-300">{company?.phone || ""}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Formulário */}
        <div className="border border-slate-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">Dados da Simulação</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor Solicitado (MZN)</label>
              <input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value) || 0)} min={0}
                className="w-full h-10 px-3 rounded border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prazo (meses)</label>
              <input type="number" value={termMonths} onChange={(e) => setTermMonths(Number(e.target.value) || 1)} min={1} max={120}
                className="w-full h-10 px-3 rounded border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Taxa de Juros (% ao mês)</label>
              <input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} min={0} max={100} step={0.1}
                className="w-full h-10 px-3 rounded border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Frequência de Pagamento</label>
              <div className="grid grid-cols-4 gap-2">
                {(["monthly", "biweekly", "weekly", "daily"] as Frequency[]).map((f) => (
                  <button key={f} onClick={() => setFrequency(f)}
                    className={`px-3 py-2 rounded text-sm font-medium transition-all ${frequency === f ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"}`}>
                    {f === "monthly" ? "Mensal" : f === "biweekly" ? "Quinzenal" : f === "weekly" ? "Semanal" : "Diário"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">{numInstallments} parcelas · {frequencyLabel}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Sistema de Amortização</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setSystem("price")}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${system === "price" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"}`}>PRICE</button>
                <button onClick={() => setSystem("sac")}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${system === "sac" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"}`}>SAC</button>
              </div>
            </div>
          </div>
          {frequency === "daily" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Dias de Pagamento</label>
              <div className="grid grid-cols-7 gap-2">
                {[{ day: 0, label: "Dom" }, { day: 1, label: "Seg" }, { day: 2, label: "Ter" }, { day: 3, label: "Qua" }, { day: 4, label: "Qui" }, { day: 5, label: "Sex" }, { day: 6, label: "Sáb" }].map(({ day, label }) => (
                  <button key={day} type="button" onClick={() => toggleWeekDay(day as WeekDay)}
                    className={`h-10 rounded text-xs font-medium transition-all ${selectedWeekDays.includes(day as WeekDay) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button onClick={handleSimulate} className="flex items-center gap-2 px-6 py-2.5 rounded bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Simular
            </button>
            <button onClick={handleExportPDF} disabled={schedule.length === 0} className="flex items-center gap-2 px-6 py-2.5 rounded bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:bg-slate-300">
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
            <button onClick={handlePrint} disabled={schedule.length === 0} className="flex items-center gap-2 px-6 py-2.5 rounded bg-slate-600 text-sm font-medium text-white hover:bg-slate-700 transition-colors shadow-sm disabled:bg-slate-300">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button onClick={handleClear} className="flex items-center gap-2 px-6 py-2.5 rounded border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Plus className="w-4 h-4 rotate-45" /> Excluir
            </button>
          </div>
        </div>

        {/* Resumo */}
        {showTable && schedule.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs text-blue-600 font-medium uppercase">Valor Solicitado</p>
                <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrencyMT(capital)}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-xs text-emerald-600 font-medium uppercase">Prestação Estimada</p>
                <p className="text-xl font-bold text-emerald-700 mt-1">{formatCurrencyMT(installmentValue)}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs text-amber-600 font-medium uppercase">Juros Totais</p>
                <p className="text-xl font-bold text-amber-700 mt-1">{formatCurrencyMT(totalInterest)}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-600 font-medium uppercase">Total a Pagar</p>
                <p className="text-xl font-bold text-slate-700 mt-1">{formatCurrencyMT(totalToPay)}</p>
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
                <h3 className="font-semibold text-slate-700">Plano de Pagamento</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-4 py-3 text-left font-medium">Parcela</th>
                      <th className="px-4 py-3 text-left font-medium">Vencimento</th>
                      <th className="px-4 py-3 text-right font-medium">Capital (MZN)</th>
                      <th className="px-4 py-3 text-right font-medium">Juros (MZN)</th>
                      <th className="px-4 py-3 text-right font-medium">Prestação (MZN)</th>
                      <th className="px-4 py-3 text-right font-medium">Saldo Devedor (MZN)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {schedule.map((row) => (
                      <tr key={row.period} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-700 font-medium">{row.period}</td>
                        <td className="px-4 py-2 text-slate-700">{row.dueDate}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{formatCurrencyMT(row.capital)}</td>
                        <td className="px-4 py-2 text-right text-amber-600">{formatCurrencyMT(row.interest)}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-800">{formatCurrencyMT(row.installment)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{formatCurrencyMT(row.balance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-semibold">
                      <td className="px-4 py-2 text-slate-900" colSpan={2}>Total</td>
                      <td className="px-4 py-2 text-right text-slate-900">{formatCurrencyMT(capital)}</td>
                      <td className="px-4 py-2 text-right text-amber-700">{formatCurrencyMT(totalInterestPaid)}</td>
                      <td className="px-4 py-2 text-right text-slate-900">{formatCurrencyMT(totalPaid)}</td>
                      <td className="px-4 py-2 text-right text-slate-900">0,00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}