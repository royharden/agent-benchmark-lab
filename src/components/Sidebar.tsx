import { FlaskConical, AlertTriangle } from "lucide-react";
import type { Page } from "@/types";

interface NavItem {
  id: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  page: Page;
  navItems: NavItem[];
  onNavigate: (page: Page) => void;
  dailyCapped: boolean;
  runCount: number;
}

export function Sidebar({ page, navItems, onNavigate, dailyCapped, runCount }: SidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 bg-slate-900 text-slate-100 flex flex-col">
      <div className="px-5 py-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight leading-tight">Benchmark Lab</h1>
            <p className="text-xs text-slate-400">Personal Agent Eval</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-teal-500/20 text-teal-300"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.label}</span>
              {item.id === "runs" && runCount > 0 && (
                <span className="ml-auto text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">
                  {runCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {dailyCapped && (
        <div className="px-3 py-3 border-t border-slate-700">
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium">Daily limit reached</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Browsing past runs in replay mode</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">
          Code checker + Jev verifier
        </p>
      </div>
    </aside>
  );
}
