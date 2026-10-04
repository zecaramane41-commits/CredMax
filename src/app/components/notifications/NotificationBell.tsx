import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, MessageSquare, Wallet, AlertTriangle } from "lucide-react";
import { fetchNotifications, markNotificationsRead, type SystemNotification } from "../../lib/notifications";
import { getActiveCompanyId } from "../../lib/auth";
import { useRealtimeSubscription } from "../../lib/realtime";

function severityIcon(severity: string) {
  if (severity === "warning") return AlertTriangle;
  if (severity === "error") return AlertTriangle;
  if (severity === "caixa") return Wallet;
  return MessageSquare;
}

function categoryColor(category: string) {
  if (category === "caixa") return "bg-blue-100 text-blue-800";
  if (category === "prestacao") return "bg-amber-100 text-amber-800";
  if (category === "payment") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-MZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const companyId = getActiveCompanyId();

  const load = useCallback(async () => {
    if (!companyId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchNotifications(false);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      /* ignore polling errors */
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => clearInterval(interval);
  }, [load]);

  useRealtimeSubscription(
    ["NOTIFICATION_CREATED", "FINANCE_SESSION_CHANGED", "LOAN_REQUEST_CREATED", "LOAN_DECISION_UPDATED", "LOAN_DISBURSED"],
    () => {
      void load();
    },
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      const result = await markNotificationsRead();
      setUnreadCount(result.unreadCount);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="Notificacoes"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-h-[480px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div>
              <p className="font-semibold text-slate-900">Alertas do Sistema</p>
              <p className="text-xs text-slate-500">Movimentos de caixa, prestacoes e SMS</p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar lidas
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">A carregar...</p>
            )}
            {!loading && notifications.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Sem alertas no momento.</p>
            )}
            {notifications.map((item) => {
              const Icon = severityIcon(item.severity);
              return (
                <div
                  key={item.id}
                  className={`px-4 py-3 border-b border-slate-100 ${item.isRead ? "bg-white" : "bg-blue-50/50"}`}
                >
                  <div className="flex gap-3">
                    <div className={`mt-0.5 rounded-lg p-1.5 ${item.severity === "warning" ? "bg-amber-100" : "bg-slate-100"}`}>
                      <Icon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${categoryColor(item.category)}`}>
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{item.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatTime(item.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
