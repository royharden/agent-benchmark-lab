// bench-api: No AI. Creates runs, runs mock contenders in the sandbox, finishes runs,
// saves cloned tasks, computes scores and the leaderboard.
// All writes go through here (or the AI functions) using the service role key. Actions and
// columns are whitelisted; transcripts, world state, checker results, scores and jev_agrees
// are always produced server side from stored data, never taken from the client.
// Routes on `action` in the JSON body for POST, or the ?action= query param for GET reads.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { runCheckers } from "../_shared/sandbox/checkers.ts";
import { scoreRun } from "../_shared/sandbox/scoring.ts";
import { mockStyleFor, runMockContender } from "../_shared/sandbox/mockContender.ts";
import {
  MAX_FINAL_ANSWER_CHARS,
  MAX_RUN_STATE_BYTES,
  MAX_STEPS,
  MAX_TOOL_RESULT_CHARS,
  clampDeep,
  clampString,
  clampToolResult,
  jsonBytes,
  normalizeFixtures,
  normalizeStringList,
  normalizeTranscript,
  normalizeWorld,
  sanitizeToolArgs,
} from "../_shared/sandbox/guards.ts";
import { emptyTranscript, emptyWorld } from "../_shared/sandbox/types.ts";
import type { Transcript, WorldState } from "../_shared/sandbox/types.ts";
import {
  errorResponse,
  getServiceClient,
  isUuid,
  jsonError,
  jsonResponse,
  preflight,
  readJsonBody,
} from "../_shared/http.ts";
import { bumpUsage, limitFromEnv } from "../_shared/usage.ts";
import { CATEGORIES, validateNewTask } from "./validate.ts";

const MAX_BODY_BYTES = 128 * 1024;
const MAX_RUNS_PER_REQUEST = 10;
const DEFAULT_WRITE_LIMIT = 1000;

const READ_ACTIONS = new Set(["tasks", "contenders", "runs", "run", "leaderboard", "verifier", "stats"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const supabase = getServiceClient();
  if (!supabase) return jsonError(503, "server_not_configured");

  try {
    // GET routes via query param ?action= (reads only)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") || "tasks";
      if (!READ_ACTIONS.has(action)) return jsonError(400, "unknown_action");
      return await handleRead(supabase, action, Object.fromEntries(url.searchParams));
    }

    if (req.method !== "POST") return jsonError(405, "method_not_allowed");

    // POST routes via body.action
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    const action = typeof body.action === "string" ? body.action : "";
    if (READ_ACTIONS.has(action)) return await handleRead(supabase, action, body);

    switch (action) {
      case "create_runs":
        return await createRuns(supabase, body);
      case "run_mock":
        return await runMock(supabase, body);
      case "finish":
        return await finishRun(supabase, body);
      case "create_task":
        return await createTask(supabase, body);
      default:
        return jsonError(400, "unknown_action");
    }
  } catch (err) {
    return errorResponse(err);
  }
});

// Daily cap on bench-api writes (no paid calls, but bounds how many rows anon can create).
async function writeCapResponse(supabase: SupabaseClient): Promise<Response | null> {
  const verdict = await bumpUsage(supabase, "bench-api-writes", limitFromEnv("BENCH_WRITE_LIMIT", DEFAULT_WRITE_LIMIT));
  return verdict.ok ? null : jsonError(verdict.status, verdict.error);
}

async function handleRead(supabase: SupabaseClient, action: string, params: Record<string, unknown>): Promise<Response> {
  switch (action) {
    case "tasks": {
      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: true });
      if (error) return jsonError(500, "Failed to fetch tasks");
      return jsonResponse(data);
    }
    case "contenders": {
      const { data, error } = await supabase.from("contenders").select("*").order("name", { ascending: true });
      if (error) return jsonError(500, "Failed to fetch contenders");
      return jsonResponse(data);
    }
    case "runs": {
      const taskId = params.task_id;
      if (taskId !== undefined && taskId !== "" && !isUuid(taskId)) return jsonError(400, "invalid task_id");
      const parsedLimit = Math.floor(Number(params.limit ?? 50));
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 50;
      let query = supabase
        .from("runs")
        .select("*, task:tasks(*), contender:contenders(*)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (isUuid(taskId)) query = query.eq("task_id", taskId);
      const { data, error } = await query;
      if (error) return jsonError(500, "Failed to fetch runs");
      return jsonResponse(data);
    }
    case "run": {
      const runId = params.id;
      if (!isUuid(runId)) return jsonError(400, "id is required");
      const { data, error } = await supabase
        .from("runs")
        .select("*, task:tasks(*), contender:contenders(*)")
        .eq("id", runId)
        .maybeSingle();
      if (error || !data) return jsonError(404, "Run not found");
      return jsonResponse(data);
    }
    case "leaderboard": {
      const category = typeof params.category === "string" && params.category ? params.category : "all";
      if (category !== "all" && !CATEGORIES.includes(category)) return jsonError(400, "invalid category");
      const { data: runs, error } = await supabase
        .from("runs")
        .select("*, contender:contenders(*), task:tasks(*)")
        .eq("status", "completed");
      if (error) return jsonError(500, "Failed to fetch leaderboard");
      const filtered = (runs || []).filter((r: Record<string, unknown>) =>
        category === "all" || (r.task as { category?: string } | null)?.category === category
      );
      return jsonResponse(computeLeaderboard(filtered));
    }
    case "verifier": {
      const { data: runs, error } = await supabase
        .from("runs")
        .select("*, task:tasks(*)")
        .eq("status", "completed")
        .not("jev_agrees", "is", null);
      if (error) return jsonError(500, "Failed to fetch verifier data");
      return jsonResponse(computeVerifier(runs || []));
    }
    case "stats": {
      const { data: runs, error } = await supabase
        .from("runs")
        .select("cost_usd, jev, created_at")
        .eq("status", "completed");
      if (error) return jsonError(500, "Failed to fetch stats");
      return jsonResponse(computeStats(runs || []));
    }
    default:
      return jsonError(400, "unknown_action");
  }
}

// "Run all contenders": one run per contender for an existing task, at most 10 per request.
async function createRuns(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const taskId = body.task_id;
  if (!isUuid(taskId)) return jsonError(400, "task_id is required");

  const { data: task, error: taskErr } = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
  if (taskErr) return jsonError(500, "Failed to create runs");
  if (!task) return jsonError(404, "task_not_found");

  let contenderIds: string[];
  if (body.contender_ids !== undefined) {
    const ids = body.contender_ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_RUNS_PER_REQUEST || !ids.every(isUuid)) {
      return jsonError(422, "invalid_field: contender_ids");
    }
    const unique = [...new Set(ids as string[])];
    const { data, error } = await supabase.from("contenders").select("id").in("id", unique);
    if (error) return jsonError(500, "Failed to create runs");
    if (!data || data.length !== unique.length) return jsonError(404, "contender_not_found");
    contenderIds = unique;
  } else {
    const { data, error } = await supabase
      .from("contenders")
      .select("id")
      .order("name", { ascending: true })
      .limit(MAX_RUNS_PER_REQUEST);
    if (error) return jsonError(500, "Failed to create runs");
    contenderIds = (data || []).map((c: { id: string }) => c.id);
  }
  if (contenderIds.length === 0) return jsonError(404, "no_contenders");

  const capped = await writeCapResponse(supabase);
  if (capped) return capped;

  const { data: runs, error } = await supabase
    .from("runs")
    .insert(contenderIds.map((contenderId) => ({
      task_id: taskId,
      contender_id: contenderId,
      status: "running",
      steps: 0,
      transcript: emptyTranscript(),
      world: emptyWorld(),
      checker: { success: false, violations: [] },
      jev: {},
      completion: 0,
      trust: 0,
      overall: 0,
      cost_usd: 0,
    })))
    .select("*, contender:contenders(*)");
  if (error || !runs) return jsonError(500, "Failed to create runs");

  const order = (id: string) => contenderIds.indexOf(id);
  runs.sort((a: { contender_id: string }, b: { contender_id: string }) => order(a.contender_id) - order(b.contender_id));
  return jsonResponse(runs);
}

// Runs the scripted mock contender for a run in the sandbox (no API key needed).
async function runMock(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const runId = body.run_id;
  if (!isUuid(runId)) return jsonError(400, "run_id is required");

  const { data, error } = await supabase
    .from("runs")
    .select("id, status, contender:contenders(style), task:tasks(category, instruction, constraints, fixtures, checker_templates)")
    .eq("id", runId)
    .maybeSingle();
  if (error) return jsonError(500, "Failed to run mock contender");
  const run = data as unknown as {
    id: string;
    status: string;
    contender: { style: unknown } | null;
    task: { category: unknown; instruction: unknown; constraints: unknown; fixtures: unknown; checker_templates: unknown } | null;
  } | null;
  if (!run || !run.task || !run.contender) return jsonError(404, "Run not found");
  if (run.status !== "running") return jsonError(409, "run_finished");

  const templates = normalizeStringList(run.task.checker_templates, 10, 300);
  let mock: { transcript: Transcript; world: WorldState };
  try {
    mock = runMockContender(
      {
        category: typeof run.task.category === "string" ? run.task.category : "",
        instruction: typeof run.task.instruction === "string" ? run.task.instruction : "",
        constraints: normalizeStringList(run.task.constraints, 50, 500),
        fixtures: normalizeFixtures(run.task.fixtures),
      },
      mockStyleFor(typeof run.contender.style === "string" ? run.contender.style : ""),
    );
  } catch (err) {
    console.error("bench-api: mock contender failed:", err);
    return jsonError(500, "mock_failed");
  }

  const transcript: Transcript = {
    steps: mock.transcript.steps.slice(0, MAX_STEPS).map((s) => ({
      step: s.step,
      tool: s.tool,
      args: sanitizeToolArgs(s.tool, s.args),
      result: clampToolResult(s.result),
      result_str: clampString(String(s.result_str ?? ""), MAX_TOOL_RESULT_CHARS),
    })),
    final_answer: mock.transcript.final_answer === null ? null : clampString(mock.transcript.final_answer, MAX_FINAL_ANSWER_CHARS),
  };
  const world = clampDeep(mock.world) as WorldState;
  if (jsonBytes({ transcript, world }) > MAX_RUN_STATE_BYTES) return jsonError(422, "run_state_too_large");

  const checker = runCheckers(templates, world, transcript);
  const { data: saved, error: saveErr } = await supabase
    .from("runs")
    .update({
      transcript,
      world,
      checker,
      status: "graded_pending",
      steps: transcript.steps.length,
    })
    .eq("id", run.id)
    .eq("status", "running")
    .select("id");
  if (saveErr) return jsonError(500, "Failed to run mock contender");
  if (!saved || saved.length === 0) return jsonError(409, "run_finished");

  return jsonResponse({
    run_id: run.id,
    status: "graded_pending",
    done: true,
    steps: transcript.steps.length,
    checker,
  });
}

// Completes a finished run without a Jev grade (no key, daily cap, or Jev error).
// Checker and scores are recomputed from the stored run.
async function finishRun(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const runId = body.run_id;
  if (!isUuid(runId)) return jsonError(400, "run_id is required");

  const { data, error } = await supabase
    .from("runs")
    .select("id, status, transcript, world, task:tasks(checker_templates)")
    .eq("id", runId)
    .maybeSingle();
  if (error) return jsonError(500, "Failed to finish run");
  const run = data as unknown as {
    id: string;
    status: string;
    transcript: unknown;
    world: unknown;
    task: { checker_templates: unknown } | null;
  } | null;
  if (!run || !run.task) return jsonError(404, "Run not found");
  if (run.status !== "graded_pending" && run.status !== "grading") return jsonError(409, "run_not_finishable");

  const templates = normalizeStringList(run.task.checker_templates, 10, 300);
  const checker = runCheckers(templates, normalizeWorld(run.world), normalizeTranscript(run.transcript));
  const score = scoreRun(checker, null, templates);

  const { data: saved, error: saveErr } = await supabase
    .from("runs")
    .update({
      checker,
      status: "completed",
      completion: score.completion,
      trust: score.trust,
      overall: score.overall,
      jev_agrees: null,
    })
    .eq("id", run.id)
    .in("status", ["graded_pending", "grading"])
    .select("*, task:tasks(*), contender:contenders(*)");
  if (saveErr) return jsonError(500, "Failed to finish run");
  if (!saved || saved.length === 0) return jsonError(409, "run_not_finishable");
  return jsonResponse(saved[0]);
}

async function createTask(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const task = validateNewTask(body);

  const capped = await writeCapResponse(supabase);
  if (capped) return capped;

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: task.title,
      category: task.category,
      difficulty: task.difficulty,
      instruction: task.instruction,
      constraints: task.constraints,
      fixtures: task.fixtures,
      checker_templates: task.checker_templates,
      has_trap: task.has_trap,
    })
    .select()
    .single();
  if (error) return jsonError(500, "Failed to create task");
  return jsonResponse(data);
}

function computeLeaderboard(runs: Record<string, unknown>[]): unknown {
  const leaderboard = new Map<string, {
    contender_id: string;
    contender_name: string;
    model: string;
    style: string;
    runs: number;
    avg_overall: number;
    avg_completion: number;
    avg_trust: number;
    avg_steps: number;
    total_cost: number;
  }>();

  for (const run of runs) {
    const c = run.contender as Record<string, unknown> | null;
    if (!c) continue;
    const key = c.id as string;
    if (!leaderboard.has(key)) {
      leaderboard.set(key, {
        contender_id: key,
        contender_name: c.name as string,
        model: c.model as string,
        style: c.style as string,
        runs: 0,
        avg_overall: 0,
        avg_completion: 0,
        avg_trust: 0,
        avg_steps: 0,
        total_cost: 0,
      });
    }
    const entry = leaderboard.get(key)!;
    entry.runs++;
    entry.avg_overall += Number(run.overall) || 0;
    entry.avg_completion += Number(run.completion) || 0;
    entry.avg_trust += Number(run.trust) || 0;
    entry.avg_steps += Number(run.steps) || 0;
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

function computeVerifier(runs: Record<string, unknown>[]): unknown {
  let agrees = 0;
  let disagrees = 0;
  const confusion = { tt: 0, tf: 0, ft: 0, ff: 0 };
  const disagreements: unknown[] = [];

  for (const run of runs) {
    const checkerSuccess = Number(run.completion) === 1;
    const jev = run.jev as Record<string, unknown> | null;
    const jevAnswers = jev?.answers as Record<string, unknown> | undefined;
    const completedAnswer = jevAnswers?.["completed"] as { noul?: number } | undefined;
    const jevSaysCompleted = (completedAnswer?.noul ?? 0) >= 0.5;

    if (checkerSuccess && jevSaysCompleted) confusion.tt++;
    else if (checkerSuccess && !jevSaysCompleted) confusion.tf++;
    else if (!checkerSuccess && jevSaysCompleted) confusion.ft++;
    else confusion.ff++;

    if (run.jev_agrees === true) agrees++;
    else if (run.jev_agrees === false) {
      disagrees++;
      const task = run.task as { title?: string } | null;
      disagreements.push({
        run_id: run.id,
        task_title: task?.title || "Unknown",
        checker_success: checkerSuccess,
        jev_says_completed: jevSaysCompleted,
        overall: Number(run.overall) || 0,
      });
    }
  }

  const total = runs.length;
  return {
    total,
    agrees,
    disagrees,
    agreement_rate: total > 0 ? Math.round((agrees / total) * 10000) / 10000 : 0,
    confusion_matrix: confusion,
    disagreements,
  };
}

function computeStats(runs: Record<string, unknown>[]): unknown {
  const validRuns = runs.filter((r) => {
    const jev = r.jev as Record<string, unknown> | null;
    return jev && Object.keys(jev).length > 0;
  });
  const totalCost = validRuns.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  const avgCostPerRun = validRuns.length > 0 ? totalCost / validRuns.length : 0;
  const totalInputTokens = validRuns.reduce((sum, r) => {
    const jev = r.jev as { usage?: { input_tokens?: number } } | null;
    return sum + (jev?.usage?.input_tokens || 0);
  }, 0);

  return {
    graded_runs: validRuns.length,
    total_cost: Math.round(totalCost * 100000) / 100000,
    avg_cost_per_run: Math.round(avgCostPerRun * 100000) / 100000,
    total_input_tokens: totalInputTokens,
    estimated_llm_judge_cost:
      Math.round((totalInputTokens * 2 / 1_000_000 + validRuns.length * 500 * 2 / 1_000_000) * 100000) / 100000,
  };
}
