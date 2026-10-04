import { Bell } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Bell className="w-6 h-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notificações</h1>
          <p className="text-sm text-slate-500">Visualize e gerencie as notificações do sistema</p>
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg p-8 text-center">
        <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Nenhuma notificação disponível no momento.</p>
      </div>
    </div>
  );
}