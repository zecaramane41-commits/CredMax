import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CreditCard, FileText, Loader2, ShieldCheck, User, Wallet } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { fetchClient360, type Client360Profile } from "../../lib/client-360";
import { formatCurrencyMT } from "../../lib/format";

function Card({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Wallet }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4" />{title}</div><div className="mt-2 text-xl font-bold text-slate-900">{value}</div></div>;
}

export default function Client360Page() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Client360Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Number(clientId);
    if (!Number.isInteger(id) || id <= 0) { setError("Cliente invalido."); setLoading(false); return; }
    setLoading(true);
    fetchClient360(id).then(setProfile).catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar Cliente 360.")).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />A carregar Cliente 360...</div>;
  if (error || !profile) return <div className="space-y-4"><button className="flex items-center gap-2 text-sm text-slate-600" onClick={() => navigate("/clients")}><ArrowLeft className="h-4 w-4" />Voltar</button><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error || "Cliente não encontrado."}</div></div>;

  const { client, summary } = profile;
  return <div className="space-y-5">
    <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900" onClick={() => navigate("/clients")}><ArrowLeft className="h-4 w-4" />Clientes</button>
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div><div className="flex items-center gap-3"><div className="rounded-full bg-emerald-100 p-3 text-emerald-700"><User className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold">{client.name}</h1><p className="text-sm text-slate-500">#{client.id} · NUIT {client.nuit} · {client.phone}</p></div></div></div>
        <div className="flex gap-2"><Badge>{client.type}</Badge><Badge variant="outline">Score {client.score}</Badge><Badge variant="outline">{client.status}</Badge></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Saldo em dívida" value={formatCurrencyMT(summary.totalDebt)} icon={Wallet} />
        <Card title="Total desembolsado" value={formatCurrencyMT(summary.totalDisbursed)} icon={CreditCard} />
        <Card title="Total pago" value={formatCurrencyMT(summary.totalPaid)} icon={Wallet} />
        <Card title="Créditos activos" value={String(summary.activeLoans)} icon={CreditCard} />
      </div>
    </div>

    <Tabs defaultValue="overview" className="rounded-2xl border bg-white p-4 shadow-sm">
      <TabsList className="flex h-auto flex-wrap justify-start gap-1">
        <TabsTrigger value="overview">Resumo</TabsTrigger><TabsTrigger value="identity">Dados</TabsTrigger>
        <TabsTrigger value="credits">Créditos ({summary.totalLoans})</TabsTrigger><TabsTrigger value="documents">Documentos ({summary.documentsCount})</TabsTrigger>
        <TabsTrigger value="risk">Risco & Avaliações</TabsTrigger><TabsTrigger value="guarantees">Garantias ({summary.guaranteesCount})</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-5"><div className="grid gap-4 md:grid-cols-2"><section className="rounded-xl border p-4"><h2 className="mb-3 font-semibold">Situação financeira</h2><p>Rendimento mensal: <strong>{formatCurrencyMT(client.monthlyIncome)}</strong></p><p>Despesas mensais: <strong>{formatCurrencyMT(client.monthlyExpenses)}</strong></p><p>Prestações em atraso: <strong>{summary.overdueInstallments}</strong> ({formatCurrencyMT(summary.overdueAmount)})</p></section><section className="rounded-xl border p-4"><h2 className="mb-3 font-semibold">Carteira</h2><p>{client.carteira?.name || "Sem carteira atribuída"}</p><p className="text-sm text-slate-500">{client.carteira?.gestorName || "Sem gestor definido"}</p></section></div></TabsContent>
      <TabsContent value="identity" className="mt-5"><div className="grid gap-3 md:grid-cols-2">{[["Documento", client.documentNumber || "—"],["Email", client.email || "—"],["Nascimento", client.birthDate || "—"],["Profissão", client.occupation || "—"],["Empregador", client.employerName || "—"],["Endereço", client.addressLine || "—"],["Província", client.province || "—"],["Cidade/Distrito", [client.city, client.district].filter(Boolean).join(" / ") || "—"]].map(([k,v])=><div key={k} className="rounded-lg border p-3"><div className="text-xs text-slate-500">{k}</div><div className="font-medium">{v}</div></div>)}</div></TabsContent>
      <TabsContent value="credits" className="mt-5"><div className="space-y-3">{profile.loans.map((l) => <div key={String(l.id)} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{String(l.contract_no)}</strong><Badge variant="outline">{String(l.status)}</Badge></div><div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm"><span>Produto: {String(l.product)}</span><span>Principal: {formatCurrencyMT(Number(l.principal))}</span><span>Saldo: {formatCurrencyMT(Number(l.balance))}</span><span>Atraso: {String(l.days_overdue || 0)} dias</span></div></div>)}{!profile.loans.length && <p className="text-slate-500">Nenhum crédito registado.</p>}</div></TabsContent>
      <TabsContent value="documents" className="mt-5"><div className="space-y-2">{profile.documents.map((d,i)=><div key={String(d.id ?? i)} className="flex items-center justify-between rounded-lg border p-3"><span className="flex items-center gap-2"><FileText className="h-4 w-4" />{String(d.title || d.doc_type || "Documento")}</span><span className="text-xs text-slate-500">{String(d.version_no || "—")} · {String(d.uploaded_at || "")}</span></div>)}{!profile.documents.length && <p className="text-slate-500">Nenhum documento registado.</p>}</div></TabsContent>
      <TabsContent value="risk" className="mt-5"><div className="space-y-2">{profile.evaluations.map((e,i)=><div key={String(e.id ?? i)} className="rounded-lg border p-3"><div className="flex justify-between"><strong>Score {String(e.final_score)}</strong><Badge variant="outline">{String(e.decision)}</Badge></div><p className="text-sm text-slate-500">{String(e.recommendation || e.note || "")}</p></div>)}{!profile.evaluations.length && <p className="text-slate-500">Nenhuma avaliação registada.</p>}</div></TabsContent>
      <TabsContent value="guarantees" className="mt-5"><div className="grid gap-3 md:grid-cols-2">{profile.guarantees.guarantors.map((g,i)=><div key={String(g.id ?? i)} className="rounded-lg border p-3"><div className="flex gap-2 font-medium"><ShieldCheck className="h-4 w-4" />{String(g.name)}</div><p className="text-sm text-slate-500">NUIT {String(g.nuit)} · {formatCurrencyMT(Number(g.guaranteed_amount))}</p></div>)}{profile.guarantees.collaterals.map((g,i)=><div key={String(g.id ?? i)} className="rounded-lg border p-3"><div className="flex gap-2 font-medium"><Building2 className="h-4 w-4" />{String(g.description)}</div><p className="text-sm text-slate-500">{String(g.collateral_type)} · {formatCurrencyMT(Number(g.estimated_value))}</p></div>)}{!summary.guaranteesCount && <p className="text-slate-500">Nenhuma garantia registada.</p>}</div></TabsContent>
    </Tabs>
  </div>;
}
