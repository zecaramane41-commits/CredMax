import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  description: string;
  icon: LucideIcon;
  tips?: string[];
  children: ReactNode;
};

export default function OperationPageShell({ title, description, icon: Icon, tips, children }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-100 p-2.5">
            <Icon className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600 mt-0.5">{description}</p>
            {tips && tips.length > 0 && (
              <ul className="mt-2 text-xs text-slate-500 list-disc list-inside space-y-0.5">
                {tips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
