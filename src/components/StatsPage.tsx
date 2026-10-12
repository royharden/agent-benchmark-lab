import { useState, useEffect } from "react";
import { BarChart3, DollarSign, TrendingDown, Calculator } from "lucide-react";
import type { StatsData } from "@/types";
import { fetchStatsDirect } from "@/lib/supabase";
import { formatCost } from "@/lib/scoring";

export function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [jevRate, setJevRate] = useState(0.042);
  const [judgeInputRate, setJudgeInputRate] = useState(2);
  const [judgeOutputRate, setJudgeOutputRate] = useState(2);
  const [judgeOutputTokens, setJudgeOutputTokens] = useState(500);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStatsDirect()
      .then((d) => {
        if (!cancelled) setStats(d);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Cost Stats</h2>
        <div className="flex items-center justify-center py-20 text-gray-400">
          <p className="text-sm">Loading stats...</p>
        </div>
      </div>
    );
  }

  if (!stats || stats.graded_runs === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Cost Stats</h2>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <BarChart3 className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm">No Jev-graded runs yet. Run tasks with Jev enabled to see cost stats.</p>
        </div>
      </div>
    );
  }

  const jevCostPerRun = stats.avg_cost_per_run;
  const estimatedJudgeCostPerRun =
    (stats.total_input_tokens / Math.max(stats.graded_runs, 1) * judgeInputRate / 1_000_000) +
    (judgeOutputTokens * judgeOutputRate / 1_000_000);
  const savings = estimatedJudgeCostPerRun > 0 ? ((1 - jevCostPerRun / estimatedJudgeCostPerRun) * 100) : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-7 w-7 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cost Stats</h2>
          <p className="text-sm text-gray-500">Jev grading cost vs. estimated LLM-as-judge cost</p>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Graded Runs</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.graded_runs}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Jev Cost</p>
          </div>
          <p className="text-3xl font-bold text-green-600">{formatCost(stats.total_cost)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-blue-600" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Jev Cost / Run</p>
          </div>
          <p className="text-3xl font-bold text-blue-600">{formatCost(jevCostPerRun)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-teal-600" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Savings vs Judge</p>
          </div>
          <p className="text-3xl font-bold text-teal-600">{savings.toFixed(0)}%</p>
        </div>
      </div>

      {/* Cost comparison bars */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Cost Per Graded Run</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-medium text-gray-700">Jev (jev-1.13.0)</span>
              <span className="font-mono font-bold text-green-600">{formatCost(jevCostPerRun)}</span>
            </div>
            <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-end pr-2"
                style={{ width: `${Math.max((jevCostPerRun / Math.max(estimatedJudgeCostPerRun, jevCostPerRun)) * 100, 5)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-medium text-gray-700">Estimated LLM-as-Judge</span>
              <span className="font-mono font-bold text-blue-600">{formatCost(estimatedJudgeCostPerRun)}</span>
            </div>
            <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-end pr-2"
                style={{ width: `${Math.max((estimatedJudgeCostPerRun / Math.max(estimatedJudgeCostPerRun, jevCostPerRun)) * 100, 5)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Editable constants */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Cost Model Constants (editable)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Jev rate ($/M input tokens)</label>
            <input
              type="number"
              step="0.001"
              value={jevRate}
              onChange={(e) => setJevRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Judge input rate ($/M tokens)</label>
            <input
              type="number"
              step="0.1"
              value={judgeInputRate}
              onChange={(e) => setJudgeInputRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Judge output rate ($/M tokens)</label>
            <input
              type="number"
              step="0.1"
              value={judgeOutputRate}
              onChange={(e) => setJudgeOutputRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Judge output tokens/run</label>
            <input
              type="number"
              step="50"
              value={judgeOutputTokens}
              onChange={(e) => setJudgeOutputTokens(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-400">Total Input Tokens</p>
            <p className="font-mono font-bold text-gray-700">{stats.total_input_tokens.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-400">Estimated total judge cost</p>
            <p className="font-mono font-bold text-blue-600">{formatCost(estimatedJudgeCostPerRun * stats.graded_runs)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-400">Total Jev cost</p>
            <p className="font-mono font-bold text-green-600">{formatCost(stats.total_cost)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
