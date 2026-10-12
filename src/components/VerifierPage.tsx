import { useState, useEffect } from "react";
import { ShieldCheck, AlertCircle, ThumbsUp, ThumbsDown } from "lucide-react";
import type { VerifierData } from "@/types";
import { fetchVerifierDataDirect } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

export function VerifierPage() {
  const [data, setData] = useState<VerifierData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVerifierDataDirect()
      .then((d) => {
        if (!cancelled) setData(d);
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
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Verifier Agreement</h2>
        <div className="flex items-center justify-center py-20 text-gray-400">
          <p className="text-sm">Loading verifier data...</p>
        </div>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Verifier Agreement</h2>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ShieldCheck className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm">No graded runs yet. Run tasks with Jev enabled to see verifier agreement.</p>
        </div>
      </div>
    );
  }

  const agreementPct = (data.agreement_rate * 100).toFixed(1);

  const confusionData = [
    { name: "Both agree: PASS", value: data.confusion_matrix.tt, fill: "#10b981" },
    { name: "Checker FAIL, Jev says PASS", value: data.confusion_matrix.ft, fill: "#ef4444" },
    { name: "Checker PASS, Jev says FAIL", value: data.confusion_matrix.tf, fill: "#f59e0b" },
    { name: "Both agree: FAIL", value: data.confusion_matrix.ff, fill: "#6b7280" },
  ].filter((d) => d.value > 0);

  const summaryData = [
    { name: "Agree", value: data.agrees, fill: "#10b981" },
    { name: "Disagree", value: data.disagrees, fill: "#ef4444" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="h-7 w-7 text-teal-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Verifier Agreement</h2>
          <p className="text-sm text-gray-500">How often Jev's judgment matches the code checker</p>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Agreement Rate</p>
          <p className={`text-3xl font-bold mt-2 ${data.agreement_rate >= 0.8 ? "text-green-600" : data.agreement_rate >= 0.6 ? "text-amber-600" : "text-red-600"}`}>
            {agreementPct}%
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Runs</p>
          <p className="text-3xl font-bold mt-2 text-gray-800">{data.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Agreements</p>
          <div className="flex items-center gap-2 mt-2">
            <ThumbsUp className="h-7 w-7 text-green-600" />
            <p className="text-3xl font-bold text-green-600">{data.agrees}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Disagreements</p>
          <div className="flex items-center gap-2 mt-2">
            <ThumbsDown className="h-7 w-7 text-red-600" />
            <p className="text-3xl font-bold text-red-600">{data.disagrees}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Pie chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Agreement vs Disagreement</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={summaryData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={(entry) => `${entry.name}: ${entry.value}`}
              >
                {summaryData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Confusion matrix */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Confusion Matrix</h3>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div></div>
            <div className="font-semibold text-gray-500">Jev: PASS</div>
            <div className="font-semibold text-gray-500">Jev: FAIL</div>
            <div className="font-semibold text-gray-500 text-right pr-2">Checker: PASS</div>
            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
              <p className="text-xl font-bold text-green-700">{data.confusion_matrix.tt}</p>
              <p className="text-xs text-green-600 mt-0.5">agree</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
              <p className="text-xl font-bold text-amber-700">{data.confusion_matrix.tf}</p>
              <p className="text-xs text-amber-600 mt-0.5">disagree</p>
            </div>
            <div className="font-semibold text-gray-500 text-right pr-2">Checker: FAIL</div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <p className="text-xl font-bold text-red-700">{data.confusion_matrix.ft}</p>
              <p className="text-xs text-red-600 mt-0.5">disagree</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xl font-bold text-gray-600">{data.confusion_matrix.ff}</p>
              <p className="text-xs text-gray-500 mt-0.5">agree</p>
            </div>
          </div>
        </div>
      </div>

      {/* Disagreements list */}
      {data.disagreements.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Disagreements ({data.disagreements.length})
            </h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.disagreements.map((d, i) => (
              <div key={i} className="px-5 py-3 border-b border-gray-50 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-gray-700">{d.task_title}</p>
                  <p className="text-xs text-gray-400">
                    Checker: {d.checker_success ? "PASS" : "FAIL"} · Jev: {d.jev_says_completed ? "PASS" : "FAIL"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-500">score: {d.overall.toFixed(1)}</span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.hash = `runs/${d.run_id}`;
                    }}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    View run
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
