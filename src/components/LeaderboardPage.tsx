import { useState, useEffect } from "react";
import { Trophy, Cpu, Zap, Filter } from "lucide-react";
import type { Run, LeaderboardEntry } from "@/types";
import { fetchLeaderboardDirect } from "@/lib/supabase";
import { formatCost } from "@/lib/scoring";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface LeaderboardPageProps {
  runs: Run[];
}

const STYLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Careful: Cpu,
  Speedy: Zap,
};

export function LeaderboardPage({ runs }: LeaderboardPageProps) {
  const [category, setCategory] = useState("all");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboardDirect(category)
      .then((data) => {
        if (!cancelled) setLeaderboard(data);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, runs.length]);

  const chartData = leaderboard.map((e) => ({
    name: e.contender_name,
    overall: e.avg_overall,
    completion: e.avg_completion * 100,
    trust: e.avg_trust * 100,
  }));

  const barColors = ["#0d9488", "#3b82f6", "#f59e0b"];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="h-7 w-7 text-amber-500" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leaderboard</h2>
          <p className="text-sm text-gray-500">Contenders ranked by overall score</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-6">
        <Filter className="h-4 w-4 text-gray-400" />
        {["all", "Travel", "Scheduling", "Inbox", "Shopping & Payments"].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              category === cat
                ? "bg-slate-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <p className="text-sm">Loading leaderboard...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Trophy className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm">No completed runs yet. Run some tasks to see the leaderboard.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Score Comparison</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                />
                <Bar dataKey="overall" fill="#0d9488" radius={[4, 4, 0, 0]} name="Overall" />
                <Bar dataKey="completion" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Completion %" />
                <Bar dataKey="trust" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Trust %" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Rank</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Contender</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Overall</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Completion</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Trust</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Avg Steps</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Cost</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Runs</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => {
                  const StyleIcon = STYLE_ICONS[entry.style] || Cpu;
                  return (
                    <tr key={entry.contender_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? "bg-amber-100 text-amber-700" :
                          i === 1 ? "bg-gray-200 text-gray-600" :
                          i === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-gray-100 text-gray-400"
                        }`}>
                          {i + 1}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <StyleIcon className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-semibold text-gray-800">{entry.contender_name}</p>
                            <p className="text-xs text-gray-400">{entry.model}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`font-mono font-bold text-base ${
                          entry.avg_overall >= 70 ? "text-green-600" :
                          entry.avg_overall >= 40 ? "text-amber-600" :
                          "text-red-600"
                        }`}>
                          {entry.avg_overall.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-gray-600">
                        {(entry.avg_completion * 100).toFixed(0)}%
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-gray-600">
                        {(entry.avg_trust * 100).toFixed(0)}%
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-gray-500">
                        {entry.avg_steps.toFixed(1)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-gray-500">
                        {entry.total_cost > 0 ? formatCost(entry.total_cost) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-gray-500">
                        {entry.runs}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
