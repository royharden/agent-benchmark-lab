import { useState } from "react";
import {
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Terminal,
  Globe,
  Mail,
  Calendar,
  CreditCard,
  Plane,
  MessageSquare,
  Search,
} from "lucide-react";
import type { Run, TranscriptStep, WorldState } from "@/types";
import { formatCost, hasSafetyViolation, noulConfidence } from "@/lib/scoring";

interface RunViewProps {
  runs: Run[];
  selectedRun: Run | null;
  onSelectRun: (runId: string) => void;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  search_flights: Plane,
  book_flight: Plane,
  calendar_list: Calendar,
  calendar_add: Calendar,
  email_search: Mail,
  email_send: Mail,
  web_search: Search,
  web_open: Globe,
  pay: CreditCard,
  ask_user: MessageSquare,
};

export function RunView({ runs, selectedRun, onSelectRun }: RunViewProps) {
  const [showRawJev, setShowRawJev] = useState(false);

  const completedRuns = runs.filter((r) => r.status === "completed" || r.status === "graded_pending");
  const sortedRuns = [...completedRuns].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (sortedRuns.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Run View</h2>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Terminal className="h-12 w-12 mb-4" />
          <p className="text-sm">No runs yet. Go to Tasks and run some contenders.</p>
        </div>
      </div>
    );
  }

  const run = selectedRun || sortedRuns[0];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Run View</h2>
      <p className="text-sm text-gray-500 mb-6">Step-by-step transcript, world state, checker result, and Jev rubric.</p>

      <div className="flex gap-6">
        {/* Run list sidebar */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Runs</p>
            </div>
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {sortedRuns.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelectRun(r.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                    run?.id === r.id ? "bg-teal-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 truncate">{r.contender?.name}</span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        r.overall >= 70 ? "text-green-600" : r.overall >= 40 ? "text-amber-600" : "text-red-600"
                      }`}
                    >
                      {r.overall.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{r.task?.title}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Run detail */}
        {run && (
          <div className="flex-1 min-w-0 space-y-5">
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{run.task?.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{run.task?.instruction}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className={`text-2xl font-bold ${run.overall >= 70 ? "text-green-600" : run.overall >= 40 ? "text-amber-600" : "text-red-600"}`}>
                    {run.overall.toFixed(1)}
                  </div>
                  <p className="text-xs text-gray-400">overall</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-gray-700">{run.contender?.name}</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{run.contender?.model}</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{run.contender?.style}</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{run.steps} steps</span>
                {run.cost_usd > 0 && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-500">{formatCost(run.cost_usd)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Safety violation banner */}
            {run.checker && !run.checker.success && run.task && hasSafetyViolation(run.task.checker_templates, run.checker) && (
              <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-800">Safety violation detected</p>
                  <p className="text-xs text-red-700 mt-0.5">{run.checker.violations.join("; ")}</p>
                </div>
              </div>
            )}

            {/* Checker result */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                {run.checker?.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <h4 className="text-sm font-bold text-gray-900">Code Checker</h4>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    run.checker?.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {run.checker?.success ? "PASS" : "FAIL"}
                </span>
              </div>
              {run.checker && !run.checker.success && run.checker.violations.length > 0 && (
                <ul className="space-y-1">
                  {run.checker.violations.map((v, i) => (
                    <li key={i} className="text-xs text-red-600 font-mono pl-4">{v}</li>
                  ))}
                </ul>
              )}
              {run.checker?.success && (
                <p className="text-xs text-green-600">All constraints satisfied.</p>
              )}
            </div>

            {/* Transcript + World state side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Transcript */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h4 className="text-sm font-bold text-gray-900">Transcript</h4>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs space-y-2 bg-gray-50">
                  {run.transcript?.steps?.map((step: TranscriptStep) => {
                    const Icon = TOOL_ICONS[step.tool] || Terminal;
                    return (
                      <div key={step.step} className="bg-white rounded-lg p-3 border border-gray-100">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-400 font-bold">{step.step}.</span>
                          <Icon className="h-3.5 w-3.5 text-teal-600" />
                          <span className="font-semibold text-gray-800">{step.tool}</span>
                        </div>
                        <div className="text-gray-500 ml-6">
                          <div className="text-blue-600">args: {JSON.stringify(step.args)}</div>
                          <div className="text-gray-600 mt-1 whitespace-pre-wrap break-words">
                            → {step.result_str?.substring(0, 300)}
                            {step.result_str && step.result_str.length > 300 ? "..." : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {run.transcript?.final_answer && (
                    <div className="bg-teal-50 rounded-lg p-3 border border-teal-100">
                      <div className="font-semibold text-teal-700 mb-1">FINAL ANSWER</div>
                      <div className="text-gray-700 whitespace-pre-wrap">{run.transcript.final_answer}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* World state */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h4 className="text-sm font-bold text-gray-900">World State</h4>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto space-y-3 text-xs">
                  <WorldStateSection world={run.world} />
                </div>
              </div>
            </div>

            {/* Jev rubric */}
            {run.jev && run.jev.answers && Object.keys(run.jev.answers).length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">J</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Jev Rubric Grade</h4>
                      <p className="text-xs text-gray-400">{run.jev.model} · {run.jev.latency_ms}ms · {formatCost(run.jev.cost_usd)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.jev_agrees !== null && (
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          run.jev_agrees ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {run.jev_agrees ? "Agrees with checker" : "Disagrees"}
                      </span>
                    )}
                    <button
                      onClick={() => setShowRawJev(!showRawJev)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      {showRawJev ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showRawJev ? "Hide" : "Raw"} JSON
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <JevAnswerCard name="completed" answer={run.jev.answers["completed"]} type="noul" />
                  <JevAnswerCard name="constraints_kept" answer={run.jev.answers["constraints_kept"]} type="score" />
                  <JevAnswerCard name="confirmed_irreversible" answer={run.jev.answers["confirmed_irreversible"]} type="choice" />
                  <JevAnswerCard name="followed_injection" answer={run.jev.answers["followed_injection"]} type="noul" />
                  <JevAnswerCard name="honest_report" answer={run.jev.answers["honest_report"]} type="noul" />
                  <JevAnswerCard name="efficiency" answer={run.jev.answers["efficiency"]} type="score" />
                </div>

                {showRawJev && (
                  <pre className="mt-4 text-xs font-mono bg-gray-900 text-gray-300 rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(run.jev, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-400">No Jev grade available (API key not configured).</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WorldStateSection({ world }: { world: WorldState }) {
  if (!world) return <p className="text-gray-400">No world state.</p>;
  return (
    <>
      {world.booked_flight && (
        <div className="rounded-lg bg-sky-50 p-3 border border-sky-100">
          <div className="flex items-center gap-2 mb-1">
            <Plane className="h-3.5 w-3.5 text-sky-600" />
            <span className="font-semibold text-sky-800">Booked Flight</span>
          </div>
          <p className="text-sky-700">{world.booked_flight.id}: {world.booked_flight.airline} ${world.booked_flight.price} {world.booked_flight.stops === 0 ? "nonstop" : `${world.booked_flight.stops} stop(s)`}</p>
        </div>
      )}
      {world.sent_emails?.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 border border-amber-100">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-semibold text-amber-800">Sent Emails ({world.sent_emails.length})</span>
          </div>
          {world.sent_emails.map((e, i) => (
            <p key={i} className="text-amber-700">to: {e.to} — {e.subject}</p>
          ))}
        </div>
      )}
      {world.payments?.length > 0 && (
        <div className="rounded-lg bg-rose-50 p-3 border border-rose-100">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-3.5 w-3.5 text-rose-600" />
            <span className="font-semibold text-rose-800">Payments ({world.payments.length})</span>
          </div>
          {world.payments.map((p, i) => (
            <p key={i} className="text-rose-700">${p.amount} to {p.merchant}</p>
          ))}
        </div>
      )}
      {world.calendar_events?.length > 0 && (
        <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-semibold text-emerald-800">Calendar Events ({world.calendar_events.length})</span>
          </div>
          {world.calendar_events.map((e, i) => (
            <p key={i} className="text-emerald-700">{e.title} {e.start}</p>
          ))}
        </div>
      )}
      {world.asked_user?.length > 0 && (
        <div className="rounded-lg bg-violet-50 p-3 border border-violet-100">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3.5 w-3.5 text-violet-600" />
            <span className="font-semibold text-violet-800">User Interactions ({world.asked_user.length})</span>
          </div>
          {world.asked_user.map((a, i) => (
            <p key={i} className="text-violet-700">Q: {a.question.substring(0, 60)} → {a.reply.substring(0, 40)}</p>
          ))}
        </div>
      )}
      {world.web_searches?.length > 0 && (
        <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
          <span className="font-semibold text-gray-600">Web Searches: {world.web_searches.length}</span>
        </div>
      )}
      {!world.booked_flight && !world.sent_emails?.length && !world.payments?.length && !world.calendar_events?.length && !world.asked_user?.length && (
        <p className="text-gray-400">No side effects recorded.</p>
      )}
    </>
  );
}

function JevAnswerCard({ name, answer, type }: { name: string; answer: unknown; type: string }) {
  if (!answer || typeof answer !== "object") {
    return (
      <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500">{name}</p>
        <p className="text-xs text-gray-400 mt-1">No data</p>
      </div>
    );
  }

  const a = answer as Record<string, unknown>;

  if (type === "score") {
    const score = a.score as number;
    const confidence = a.confidence as number;
    const pct = (score / 3) * 100;
    return (
      <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
        <p className="text-xs font-semibold text-gray-700">{name}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-mono font-bold text-gray-700">{score.toFixed(2)}</span>
        </div>
        {confidence !== undefined && (
          <p className="text-xs text-gray-400 mt-1">confidence: {(confidence * 100).toFixed(0)}%</p>
        )}
      </div>
    );
  }

  if (type === "choice") {
    const choice = a.choice as string;
    const confidence = a.confidence as number;
    return (
      <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
        <p className="text-xs font-semibold text-gray-700">{name}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded">{choice}</span>
          {confidence !== undefined && (
            <span className="text-xs text-gray-400">{(confidence * 100).toFixed(0)}% sure</span>
          )}
        </div>
      </div>
    );
  }

  // noul
  const noul = a.noul as number;
  const conf = noulConfidence(noul);
  const label = noul >= 0.5 ? "true" : "false";
  return (
    <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
      <p className="text-xs font-semibold text-gray-700">{name}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${noul >= 0.5 ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-600"}`}>
          {label} ({noul.toFixed(2)})
        </span>
        <span className="text-xs text-gray-400">{(conf * 100).toFixed(0)}% conf</span>
      </div>
    </div>
  );
}
