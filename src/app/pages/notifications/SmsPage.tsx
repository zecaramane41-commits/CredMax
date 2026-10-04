import { useState } from "react";
import { MessageSquare, Send, RotateCcw } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function SmsPage() {
  const user = getUser();
  const canSend = hasPermission(user, "enviar.notificacoes");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"auto" | "manual">("manual");

  if (!canSend) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const handleSend = () => {
    if (!phone.trim() || !message.trim()) { alert("Preencha o telefone e a mensagem."); return; }
    alert(`SMS ${type === "auto" ? "automático" : "manual"} enviado para ${phone}.`);
    setPhone("");
    setMessage("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg"><MessageSquare className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">SMS</h1><p className="text-sm text-slate-500">Envio automático e manual de SMS</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">{type === "auto" ? "Envio Automático" : "Envio Manual"}</h2>
          <div className="flex gap-2">
            <button onClick={() => setType("manual")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${type === "manual" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>Manual</button>
            <button onClick={() => setType("auto")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${type === "auto" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>Automático</button>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Telefone</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+258 84 000 0000" className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Mensagem</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="w-full h-28 px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none" placeholder="Escreva a mensagem SMS..." /></div>
          <div className="flex gap-2">
            <button onClick={handleSend} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"><Send className="w-4 h-4" />Enviar SMS</button>
            <button onClick={() => { setPhone(""); setMessage(""); }} className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"><RotateCcw className="w-4 h-4" />Limpar</button>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Histórico de Envios</h2>
          <div className="space-y-2 text-sm">
            {[{ to: "+258 84 123 4567", msg: "Sua prestação vence em 5 dias.", data: "15/06" }, { to: "+258 82 987 6543", msg: "Crédito aprovado! Entre em contacto.", data: "14/06" }].map((h, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-lg"><p className="font-medium text-slate-700 text-xs">{h.to}</p><p className="text-slate-500 text-xs mt-0.5">{h.msg}</p><p className="text-[10px] text-slate-400 mt-1">{h.data}</p></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}