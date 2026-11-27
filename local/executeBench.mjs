// Local bench path. Uses the shipped mock sandbox, checkers, and scoring,
// then writes the finished run through sqliteRunStore.

import { randomUUID } from "node:crypto";
import { mockStyleFor, runMockContender } from "../supabase/functions/_shared/sandbox/mockContender.ts";
import { runCheckers } from "../supabase/functions/_shared/sandbox/checkers.ts";
import { scoreRun } from "../supabase/functions/_shared/sandbox/scoring.ts";
import { emptyTranscript, emptyWorld } from "../supabase/functions/_shared/sandbox/types.ts";
import { insertContender, insertRun, insertTask, readRun, updateRun } from "./sqliteRunStore.mjs";

export function executeBench(db, task, contender, offlineGrade = null) {
  const createdAt = new Date().toISOString();
  insertTask(db, { ...task, created_at: createdAt });
  insertContender(db, contender);
  const runId = randomUUID();
  insertRun(db, {
    id: runId,
    task_id: task.id,
    contender_id: contender.id,
    status: "running",
    steps: 0,
    transcript: emptyTranscript(),
    world: emptyWorld(),
    checker: { success: false, violations: [] },
    jev: {},
    completion: 0,
    trust: 0,
    overall: 0,
    jev_agrees: null,
    cost_usd: 0,
    created_at: createdAt,
  });

  const mock = runMockContender(
    {
      category: task.category,
      instruction: task.instruction,
      constraints: task.constraints,
      fixtures: task.fixtures,
    },
    mockStyleFor(contender.style),
  );
  const checker = runCheckers(task.checker_templates, mock.world, mock.transcript);
  updateRun(db, runId, {
    status: "graded_pending",
    steps: mock.transcript.steps.length,
    transcript: mock.transcript,
    world: mock.world,
    checker,
  });

  const stored = readRun(db, runId);
  const recomputed = runCheckers(task.checker_templates, stored.world, stored.transcript);
  const score = scoreRun(recomputed, offlineGrade, task.checker_templates);
  return updateRun(db, runId, {
    status: "completed",
    checker: recomputed,
    jev: offlineGrade ?? {},
    completion: score.completion,
    trust: score.trust,
    overall: score.overall,
    jev_agrees: score.jev_agrees,
    safety_capped: score.safety_capped,
  });
}
