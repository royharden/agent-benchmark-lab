import { useState, useCallback } from "react";
import {
  Plane,
  CalendarClock,
  Inbox as InboxIcon,
  ShoppingCart,
  AlertTriangle,
  Play,
  Loader2,
  Copy,
  Check,
  ChevronRight,
} from "lucide-react";
import type { Task, Contender, Run } from "@/types";
import { CATEGORY_COLORS, DIFFICULTY_COLORS } from "@/lib/scoring";
import { runMockContender } from "@/lib/mockContender";
import { runCheckersFrontend, hasSafetyViolationFrontend } from "@/lib/mockTools";
import {
  createRunDirect,
  callAgentStep,
  callJevGrade,
  finalizeRunDirect,
  scoreRunDirect,
  finishRunDirect,
  fetchRunsDirect,
  FunctionError,
} from "@/lib/supabase";

interface TasksPageProps {
  tasks: Task[];
  contenders: Contender[];
  runs: Run[];
  onRunComplete: () => void;
  onCloneTask: (task: Task) => void;
  onViewRun: (runId: string) => void;
  dailyCapped: boolean;
  setDailyCapped: (capped: boolean) => void;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Travel: Plane,
  Scheduling: CalendarClock,
  Inbox: InboxIcon,
  "Shopping & Payments": ShoppingCart,
};

type RunState = "idle" | "running" | "grading" | "done" | "error";

export function TasksPage({
  tasks,
  contenders,
  runs,
  onRunComplete,
  onCloneTask,
  onViewRun,
  dailyCapped,
  setDailyCapped,
}: TasksPageProps) {
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<Record<string, { state: RunState; message?: string; runIds?: string[] }>>({});
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const filteredTasks = filterCategory === "all" ? tasks : tasks.filter((t) => t.category === filterCategory);

  const runAllContenders = useCallback(
    async (task: Task) => {
      setRunningTaskId(task.id);
      setRunStatus((prev) => ({ ...prev, [task.id]: { state: "running", message: "Starting runs..." } }));
      const createdRunIds: string[] = [];

      try {
        // Try live agent-step first
        let usingLiveAgents = false;
        let usingMock = false;

        for (const contender of contenders) {
          try {
            // Create a run
            const run = await createRunDirect(task.id, contender.id);
            createdRunIds.push(run.id);

            // Run agent steps (up to 12)
            let done = false;
            while (!done) {
              try {
                const result = await callAgentStep(run.id);
                done = result.done;
                if (!done) {
                  setRunStatus((prev) => ({
                    ...prev,
                    [task.id]: { state: "running", message: `${contender.name}: step ${result.steps}`, runIds: createdRunIds },
                  }));
                } else if (result.condensed_transcript) {
                  // Run is finalized, need to grade with Jev
                  setRunStatus((prev) => ({
                    ...prev,
                    [task.id]: { state: "grading", message: `${contender.name}: grading with Jev...`, runIds: createdRunIds },
                  }));

                  try {
                    const jevResult = await callJevGrade(run.id);
                    // Score the run
                    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bench-api`, {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        action: "score",
                        run_id: run.id,
                        jev: jevResult.jev,
                        checker_result: result.checker,
                        checker_templates: task.checker_templates,
                      }),
                    }).catch(() => null);
                  } catch (jevErr) {
                    if (jevErr instanceof FunctionError && jevErr.status === 429) {
                      setDailyCapped(true);
                    }
                    // Finish without Jev
                    await finishRunDirect(run.id, run.transcript, run.world, result.checker || { success: false, violations: [] }, task.checker_templates);
                  }
                }
                usingLiveAgents = true;
              } catch (agentErr) {
                if (agentErr instanceof FunctionError) {
                  if (agentErr.status === 429) {
                    setDailyCapped(true);
                    throw agentErr;
                  }
                  if (agentErr.status === 503) {
                    // No API key — use mock contender
                    usingMock = true;
                    break;
                  }
                }
                throw agentErr;
              }
            }
          } catch (err) {
            if (err instanceof FunctionError && err.status === 429) {
              setDailyCapped(true);
              throw err;
            }
            usingMock = true;
            break;
          }
        }

        if (usingMock) {
          // Use mock contenders
          createdRunIds.length = 0;
          setRunStatus((prev) => ({
            ...prev,
            [task.id]: { state: "running", message: "Using mock contenders...", runIds: [] },
          }));

          for (const contender of contenders) {
            const mockStyle = contender.style === "Careful" ? "Careful" : "Rashy";
            const { transcript, world } = runMockContender(task, mockStyle as "Careful" | "Rashy");
            const checker = runCheckersFrontend(task.checker_templates, world, transcript);

            const run = await createRunDirect(task.id, contender.id);
            createdRunIds.push(run.id);

            // Try Jev grading
            try {
              await finalizeRunDirect(run.id, transcript, world, checker);
              const jevResult = await callJevGrade(run.id);
              await scoreRunDirect(run.id, jevResult.jev, checker, task.checker_templates);
            } catch (jevErr) {
              if (jevErr instanceof FunctionError && jevErr.status === 429) {
                setDailyCapped(true);
              }
              await finishRunDirect(run.id, transcript, world, checker, task.checker_templates);
            }
          }
        }

        setRunStatus((prev) => ({
          ...prev,
          [task.id]: { state: "done", message: `${createdRunIds.length} runs completed`, runIds: createdRunIds },
        }));

        // Refresh data
        onRunComplete();
      } catch (err) {
        if (err instanceof FunctionError && err.status === 429) {
          setRunStatus((prev) => ({
            ...prev,
            [task.id]: { state: "error", message: "Daily limit reached — browse past runs" },
          }));
        } else {
          setRunStatus((prev) => ({
            ...prev,
            [task.id]: { state: "error", message: err instanceof Error ? err.message : "Failed to run" },
          }));
        }
      } finally {
        setRunningTaskId(null);
      }
    },
    [contenders, onRunComplete, setDailyCapped],
  );

  const taskRuns = (taskId: string) => runs.filter((r) => r.task_id === taskId);
  const status = (taskId: string) => runStatus[taskId];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Task Suite</h2>
        <p className="text-sm text-gray-500 mt-1">
          {tasks.length} tasks across 4 categories. Each runs against all contenders. At least 4 contain traps.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6">
        {["all", "Travel", "Scheduling", "Inbox", "Shopping & Payments"].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filterCategory === cat
                ? "bg-slate-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            {cat === "all" ? "All Categories" : cat}
          </button>
        ))}
      </div>

      {dailyCapped && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Daily lab limit reached</p>
            <p className="text-xs text-amber-700 mt-0.5">Browse past runs in the Run View — new runs will resume tomorrow.</p>
          </div>
        </div>
      )}

      {/* Task cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredTasks.map((task) => {
          const Icon = CATEGORY_ICONS[task.category] || Plane;
          const colors = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.Travel;
          const st = status(task.id);
          const tRuns = taskRuns(task.id);
          const isRunning = runningTaskId === task.id;

          return (
            <div
              key={task.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                      {task.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.has_trap && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Trap
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${DIFFICULTY_COLORS[task.difficulty] || "bg-gray-100 text-gray-600"}`}>
                      {task.difficulty}
                    </span>
                  </div>
                </div>

                <h3 className="text-base font-semibold text-gray-900 mb-2">{task.title}</h3>
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{task.instruction}</p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {task.checker_templates.map((tmpl) => {
                    const name = tmpl.split(":")[0];
                    return (
                      <span key={tmpl} className="text-xs font-mono px-2 py-1 rounded bg-gray-100 text-gray-600">
                        {name}
                      </span>
                    );
                  })}
                </div>

                {/* Run status */}
                {st && st.state !== "idle" && (
                  <div
                    className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                      st.state === "done"
                        ? "bg-green-50 text-green-700"
                        : st.state === "error"
                        ? "bg-red-50 text-red-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {st.state !== "done" && st.state !== "error" && (
                      <Loader2 className="h-3 w-3 inline animate-spin mr-1.5" />
                    )}
                    {st.state === "done" && <Check className="h-3 w-3 inline mr-1.5" />}
                    {st.message}
                  </div>
                )}

                {/* Recent runs for this task */}
                {tRuns.length > 0 && !isRunning && (
                  <div className="mb-3 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-400 mb-2">Recent runs ({tRuns.length})</p>
                    <div className="space-y-1">
                      {tRuns.slice(0, 3).map((r) => (
                        <button
                          key={r.id}
                          onClick={() => onViewRun(r.id)}
                          className="w-full flex items-center justify-between text-xs hover:bg-gray-50 rounded px-2 py-1.5 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                r.status === "completed" ? "bg-green-500" : "bg-blue-500"
                              }`}
                            />
                            <span className="font-medium text-gray-700">{r.contender?.name || "Unknown"}</span>
                          </span>
                          <span className="flex items-center gap-2 text-gray-400">
                            {r.status === "completed" && (
                              <span className="font-mono font-semibold text-gray-700">{r.overall.toFixed(1)}</span>
                            )}
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => runAllContenders(task)}
                    disabled={isRunning || dailyCapped}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Run all contenders
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => onCloneTask(task)}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    title="Clone and edit task"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
