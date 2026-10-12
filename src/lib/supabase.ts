// Supabase client singleton + edge function callers.

import { createClient, FunctionsHttpError } from "@supabase/supabase-js";
import type {
  Task,
  Contender,
  Run,
  LeaderboardEntry,
  VerifierData,
  StatsData,
  CheckerResult,
  JevResult,
} from "@/types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

// Edge functions are called through supabase.functions.invoke, which sends the anon key
// as both the Bearer token and apikey header (all functions have verify_jwt = true).
async function callFunction<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(slug, { body });
  if (error) {
    let status = 0;
    let errorMsg = error.message || "Request failed";
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      status = res.status;
      errorMsg = `Request failed (${status})`;
      try {
        const parsed = await res.json();
        errorMsg = parsed.error || errorMsg;
      } catch {
        // keep default
      }
    }
    throw new FunctionError(status, errorMsg);
  }
  return data as T;
}

export class FunctionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "FunctionError";
  }
}

// ============ Reads (direct via anon key — RLS allows SELECT) ============

export async function fetchTasksDirect(): Promise<Task[]> {
  const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data as Task[];
}

export async function fetchContendersDirect(): Promise<Contender[]> {
  const { data, error } = await supabase.from("contenders").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data as Contender[];
}

export async function fetchRunsDirect(limit = 50): Promise<Run[]> {
  const { data, error } = await supabase
    .from("runs")
    .select("*, task:tasks(*), contender:contenders(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Run[];
}

// ============ Run lifecycle (writes via bench-api edge function) ============
// The browser only sends ids: transcripts, world state, checker results and scores are
// produced and stored server side.

// Creates one run per contender for the task (server caps this at 10 per request).
export async function createRunsDirect(taskId: string): Promise<Run[]> {
  return callFunction<Run[]>("bench-api", {
    action: "create_runs",
    task_id: taskId,
  });
}

export interface AgentStepResult {
  run_id: string;
  status: string;
  done: boolean;
  reason?: string;
  steps: number;
  latest_step?: { step: number; tool: string; args: Record<string, unknown>; result_str: string };
  checker?: CheckerResult;
  condensed_transcript?: string;
}

export async function callAgentStep(runId: string): Promise<AgentStepResult> {
  return callFunction<AgentStepResult>("agent-step", { run_id: runId });
}

// Runs the scripted mock contender for a run in the server sandbox (no API key needed).
export async function runMockDirect(runId: string): Promise<AgentStepResult> {
  return callFunction<AgentStepResult>("bench-api", { action: "run_mock", run_id: runId });
}

export interface JevGradeResult {
  run_id: string;
  jev: JevResult;
}

// Grades a finished run with Jev and stores the grade and scores server side.
export async function callJevGrade(runId: string): Promise<JevGradeResult> {
  return callFunction<JevGradeResult>("jev-grade", { run_id: runId });
}

// Completes a finished run without a Jev grade; scores are computed server side.
export async function finishRunDirect(runId: string): Promise<Run> {
  return callFunction<Run>("bench-api", {
    action: "finish",
    run_id: runId,
  });
}

export async function createTaskDirect(task: {
  title: string;
  category: string;
  difficulty: string;
  instruction: string;
  constraints: string[];
  fixtures: unknown;
  checker_templates: string[];
  has_trap: boolean;
}): Promise<Task> {
  return callFunction<Task>("bench-api", {
    action: "create_task",
    ...task,
  });
}

export async function fetchLeaderboardDirect(category?: string): Promise<LeaderboardEntry[]> {
  try {
    return await callFunction<LeaderboardEntry[]>("bench-api", {
      action: "leaderboard",
      category: category && category !== "all" ? category : "all",
    });
  } catch {
    // fall through
  }

  // Fallback: compute from runs directly
  const { data: runs, error } = await supabase
    .from("runs")
    .select("*, contender:contenders(*), task:tasks(*)")
    .eq("status", "completed");
  if (error) throw error;

  const filtered = (runs || []).filter((r: Run) => {
    if (!category || category === "all") return true;
    return r.task?.category === category;
  });

  const leaderboard = new Map<string, LeaderboardEntry>();
  for (const run of filtered as Run[]) {
    const c = run.contender;
    if (!c) continue;
    if (!leaderboard.has(c.id)) {
      leaderboard.set(c.id, {
        contender_id: c.id,
        contender_name: c.name,
        model: c.model,
        style: c.style,
        runs: 0,
        avg_overall: 0,
        avg_completion: 0,
        avg_trust: 0,
        avg_steps: 0,
        total_cost: 0,
      });
    }
    const entry = leaderboard.get(c.id)!;
    entry.runs++;
    entry.avg_overall += run.overall || 0;
    entry.avg_completion += run.completion || 0;
    entry.avg_trust += Number(run.trust) || 0;
    entry.avg_steps += run.steps || 0;
    entry.total_cost += Number(run.cost_usd) || 0;
  }

  return Array.from(leaderboard.values()).map((e) => ({
    ...e,
    avg_overall: e.runs > 0 ? Math.round((e.avg_overall / e.runs) * 100) / 100 : 0,
    avg_completion: e.runs > 0 ? Math.round((e.avg_completion / e.runs) * 10000) / 10000 : 0,
    avg_trust: e.runs > 0 ? Math.round((e.avg_trust / e.runs) * 10000) / 10000 : 0,
    avg_steps: e.runs > 0 ? Math.round((e.avg_steps / e.runs) * 100) / 100 : 0,
  })).sort((a, b) => b.avg_overall - a.avg_overall);
}

export async function fetchVerifierDataDirect(): Promise<VerifierData> {
  const { data: runs, error } = await supabase
    .from("runs")
    .select("*, task:tasks(*)")
    .eq("status", "completed")
    .not("jev_agrees", "is", null);

  if (error) throw error;

  const validRuns = (runs || []) as Run[];
  let agrees = 0;
  let disagrees = 0;
  const confusion = { tt: 0, tf: 0, ft: 0, ff: 0 };
  const disagreements: VerifierData["disagreements"] = [];

  for (const run of validRuns) {
    const checkerSuccess = run.completion === 1;
    const jevCompleted = (run.jev?.answers?.["completed"]?.noul ?? 0) >= 0.5;

    if (checkerSuccess && jevCompleted) confusion.tt++;
    else if (checkerSuccess && !jevCompleted) confusion.tf++;
    else if (!checkerSuccess && jevCompleted) confusion.ft++;
    else confusion.ff++;

    if (run.jev_agrees === true) agrees++;
    else if (run.jev_agrees === false) {
      disagrees++;
      disagreements.push({
        run_id: run.id,
        task_title: run.task?.title || "Unknown",
        checker_success: checkerSuccess,
        jev_says_completed: jevCompleted,
        overall: run.overall,
      });
    }
  }

  const total = validRuns.length;
  return {
    total,
    agrees,
    disagrees,
    agreement_rate: total > 0 ? Math.round((agrees / total) * 10000) / 10000 : 0,
    confusion_matrix: confusion,
    disagreements,
  };
}

export async function fetchStatsDirect(): Promise<StatsData> {
  const { data: runs, error } = await supabase
    .from("runs")
    .select("cost_usd, jev, created_at")
    .eq("status", "completed");

  if (error) throw error;

  const validRuns = (runs || []).filter((r) => {
    const jev = r.jev as Record<string, unknown> | null;
    return jev && Object.keys(jev).length > 0;
  });
  const totalCost = validRuns.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  const avgCostPerRun = validRuns.length > 0 ? totalCost / validRuns.length : 0;
  const totalInputTokens = validRuns.reduce(
    (sum, r) => {
      const jev = r.jev as { usage?: { input_tokens?: number } } | null;
      return sum + (jev?.usage?.input_tokens || 0);
    },
    0,
  );

  return {
    graded_runs: validRuns.length,
    total_cost: Math.round(totalCost * 100000) / 100000,
    avg_cost_per_run: Math.round(avgCostPerRun * 100000) / 100000,
    total_input_tokens: totalInputTokens,
    estimated_llm_judge_cost:
      Math.round((totalInputTokens * 2 / 1_000_000 + validRuns.length * 500 * 2 / 1_000_000) * 100000) / 100000,
  };
}

