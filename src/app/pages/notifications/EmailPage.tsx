import { useState } from "react";
import { Mail, Send, RotateCcw } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function EmailPage() {
  const user = getUser();
  const canSend = hasPermission(user, "enviar.notificacoes");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  if (!canSend) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const handleSend = () => { if (!to.trim() || !subject.trim() || !body.trim()) { alert("Preencha todos os campos."); return; } alert(`Email enviado para ${to}.`); setTo(""); setSubject(""); setBody(""); };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg"><Mail className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Email</h1><p className="text-sm text-slate-500">Comunicação institucional e alertas automáticos</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Novo Email</h2>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Para</label><input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@exemplo.com" className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Assunto</label><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Assunto do email" className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Mensagem</label><textarea value={body} onChange={(e) => setBody(e.target.value)} className="w-full h-32 px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none" placeholder="Corpo do email..." /></div>
          <div className="flex gap-2"><button onClick={handleSend} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm"><Send className="w-4 h-4" />Enviar</button>
            <button onClick={() => { setTo(""); setSubject(""); setBody(""); }} className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"><RotateCcw className="w-4 h-4" />Limpar</button></div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Alertas Automáticos</h2>
          <div className="space-y-2 text-sm">{["Vencimento de prestação (3 dias antes)", "Crédito aprovado - instruções", "Mora - aviso de atraso", "Desembolso confirmado"].map((a, i) => (
            <label key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer"><input type="checkbox" defaultChecked={i < 2} className="rounded text-indigo-600" /><span className="text-slate-700">{a}</span></label>))}</div>
        </div>
      </div>
    </div>
  );
}