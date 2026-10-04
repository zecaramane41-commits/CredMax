import { useCallback, useEffect, useState } from "react";
import { Bell, MessageSquare, RefreshCw, Wallet } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { fetchNotifications, markNotificationsRead, type SystemNotification } from "../../lib/notifications";

export default function AlertsPage() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "caixa" | "prestacao" | "unread">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(false);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.isRead;
    if (filter === "all") return true;
    return n.category === filter;
  });

  const stats = {
    caixa: notifications.filter((n) => n.category === "caixa").length,
    prestacao: notifications.filter((n) => n.category === "prestacao").length,
    unread: unreadCount,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-600" />
            Alertas e Notificacoes
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Movimentos de caixa, lembretes de prestacao e historico de alertas automaticos do sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {unreadCount > 0 && (
            <Button
              size="sm"
              onClick={async () => {
                await markNotificationsRead();
                await load();
              }}
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs text-blue-700 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Alertas de caixa</p>
          <p className="text-2xl font-bold text-blue-900">{stats.caixa}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Lembretes de prestacao</p>
          <p className="text-2xl font-bold text-amber-900">{stats.prestacao}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700">Nao lidos</p>
          <p className="text-2xl font-bold text-red-900">{stats.unread}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "unread", "caixa", "prestacao"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "Todos" : f === "unread" ? "Nao lidos" : f === "caixa" ? "Caixa" : "Prestacoes"}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-12">Nenhum alerta encontrado para o filtro seleccionado.</p>
        )}
        {filtered.map((item) => (
          <div key={item.id} className={`px-4 py-4 ${item.isRead ? "" : "bg-blue-50/40"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <Badge className="text-[10px]">{item.category}</Badge>
                  {!item.isRead && <Badge className="bg-red-100 text-red-800 text-[10px]">Novo</Badge>}
                </div>
                <p className="text-sm text-slate-600">{item.message}</p>
                <p className="text-xs text-slate-400 mt-1">{new Date(item.createdAt).toLocaleString("pt-MZ")}</p>
              </div>
              <Badge className={item.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>
                {item.severity}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
