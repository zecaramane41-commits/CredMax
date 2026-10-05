import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, FileText, ShieldCheck, WalletCards, AlertTriangle } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { apiFetch } from "../../lib/api";
import { formatCurrencyMT } from "../../lib/format";

type Payload = {
  loan: any;
  summary: { principal:number; balance:number; totalPaid:number; installments:number; overdueInstallments:number; overdueAmount:number; daysOverdue:number; guarantees:number };
  timeline: any[]; installments:any[]; repayments:any[]; approvals:any[]; documents:any[]; financialEvents:any[]; promises:any[]; renegotiations:any[]; contractAudit:any[]; guarantees:{guarantors:any[];collaterals:any[]};
};

const money=(v:any)=>formatCurrencyMT(Number(v||0));
const date=(v:any)=>v ? new Date(v).toLocaleDateString("pt-PT") : "—";
const statusLabel=(v:any)=>String(v||"—").replaceAll("_"," ");

export default function Credit360Page(){
  const { creditId }=useParams();
  const navigate=useNavigate();
  const [data,setData]=useState<Payload|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{ if(!creditId)return; apiFetch<Payload>(`/loans/${creditId}/360`).then(setData).catch(e=>setError(e?.message||"Falha ao carregar crédito.")); },[creditId]);
  if(error) return <div className="p-6"><Button variant="outline" onClick={()=>navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar</Button><p className="mt-6 text-red-600">{error}</p></div>;
  if(!data) return <div className="p-6 text-sm text-slate-500">A carregar Crédito 360...</div>;
  const {loan,summary}=data;
  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><Button variant="ghost" className="mb-2 px-0" onClick={()=>navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar</Button>
        <h1 className="text-2xl font-semibold">Crédito 360°</h1>
        <p className="text-sm text-slate-500">{loan.contract_no} · {loan.client?.name} · NUIT {loan.client?.nuit || "—"}</p>
      </div><Badge>{statusLabel(loan.status)}</Badge>
    </div>
    <div className="grid gap-4 md:grid-cols-4">
      {[["Principal",summary.principal],["Saldo",summary.balance],["Total pago",summary.totalPaid],["Atraso",summary.overdueAmount]].map(([label,value])=><Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{money(value)}</p></CardContent></Card>)}
    </div>
    <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-xs text-slate-500">Produto</p><p className="font-medium">{loan.product}</p></div>
      <div><p className="text-xs text-slate-500">Taxa</p><p className="font-medium">{loan.interest_rate}%</p></div>
      <div><p className="text-xs text-slate-500">Frequência</p><p className="font-medium">{loan.payment_frequency}</p></div>
      <div><p className="text-xs text-slate-500">Gestor</p><p className="font-medium">{loan.managerName||"—"}</p></div>
    </CardContent></Card>
    <Tabs defaultValue="resumo"><TabsList className="flex flex-wrap h-auto"><TabsTrigger value="resumo">Resumo</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="analise">Análise/Aprovação</TabsTrigger><TabsTrigger value="contrato">Contrato</TabsTrigger><TabsTrigger value="garantias">Garantias</TabsTrigger><TabsTrigger value="plano">Plano</TabsTrigger><TabsTrigger value="pagamentos">Pagamentos</TabsTrigger><TabsTrigger value="cobranca">Cobrança</TabsTrigger></TabsList>
      <TabsContent value="resumo"><Card><CardHeader><CardTitle>Cliente</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div><b>{loan.client.name}</b><p className="text-sm text-slate-500">{loan.client.type}</p></div><div>Telefone<p className="text-sm text-slate-500">{loan.client.phone||"—"}</p></div><div>Documento<p className="text-sm text-slate-500">{loan.client.documentType||"—"} {loan.client.documentNumber||""}</p></div></CardContent></Card></TabsContent>
      <TabsContent value="timeline"><Card><CardContent className="space-y-4 p-5">{data.timeline.map((e,i)=><div key={`${e.type}-${i}`} className="flex gap-3 border-b pb-3"><Clock3 className="mt-1 h-4 w-4 text-slate-400"/><div><p className="font-medium">{e.title}</p><p className="text-xs text-slate-500">{date(e.date)} · {statusLabel(e.status)}</p>{e.note&&<p className="text-sm">{e.note}</p>}</div></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="analise"><Card><CardContent className="p-5">{data.approvals.length?data.approvals.map((a)=><div key={a.id} className="mb-3 rounded-lg border p-3"><p className="font-medium">Pedido #{a.id}</p><p className="text-sm">{statusLabel(a.status)}</p><p className="text-xs text-slate-500">{date(a.created_at)}</p></div>):<p className="text-sm text-slate-500">Sem registos de aprovação associados.</p>}</CardContent></Card></TabsContent>
      <TabsContent value="contrato"><Card><CardContent className="p-5 space-y-3"><p><FileText className="mr-2 inline h-4 w-4"/>Contrato: <b>{loan.contract_no}</b></p><p>Desembolso: {date(loan.disbursed_on)} · Vencimento: {date(loan.maturity_on)}</p>{data.documents.map(d=><div key={d.id} className="rounded border p-3 text-sm">{d.doc_type} · {d.doc_no} · {date(d.generated_at)}</div>)}</CardContent></Card></TabsContent>
      <TabsContent value="garantias"><Card><CardContent className="p-5 space-y-3">{[...data.guarantees.guarantors,...data.guarantees.collaterals].map(g=><div key={g.id} className="rounded border p-3"><ShieldCheck className="mr-2 inline h-4 w-4"/>{g.name||g.description} · {money(g.guaranteed_amount||g.estimated_value)}</div>)}</CardContent></Card></TabsContent>
      <TabsContent value="plano"><Card><CardContent className="overflow-auto p-5"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Parcela</th><th>Vencimento</th><th>Principal</th><th>Juros</th><th>Total</th><th>Estado</th></tr></thead><tbody>{data.installments.map(i=><tr key={i.id} className="border-b"><td className="p-2">{i.installment_no}</td><td>{date(i.due_date)}</td><td>{money(i.principal_amount)}</td><td>{money(i.interest_amount)}</td><td>{money(i.payment_amount)}</td><td>{statusLabel(i.status)}</td></tr>)}</tbody></table></CardContent></Card></TabsContent>
      <TabsContent value="pagamentos"><Card><CardContent className="space-y-3 p-5">{data.repayments.map(p=><div key={p.id} className="flex justify-between rounded border p-3"><span><WalletCards className="mr-2 inline h-4 w-4"/>{p.receipt_no||`Pagamento #${p.id}`} · {date(p.payment_date)}</span><b>{money(p.amount_received)}</b></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="cobranca"><Card><CardContent className="p-5"><p className="font-medium">{summary.daysOverdue>0?<><AlertTriangle className="mr-2 inline h-4 w-4"/>{summary.daysOverdue} dias em atraso</>:"Sem atraso registado"}</p><p className="mt-2 text-sm text-slate-500">Promessas: {data.promises.length} · Reestruturações: {data.renegotiations.length} · Eventos financeiros: {data.financialEvents.length}</p></CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
