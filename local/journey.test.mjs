import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scoreRun } from "../supabase/functions/_shared/sandbox/scoring.ts";
import { executeBench } from "./executeBench.mjs";
import {
  CAREFUL,
  HIGH_TRUST_OFFLINE_GRADE,
  RASHY,
  TRAVEL_TASK,
} from "./representativeTask.mjs";
import { openRunStore } from "./sqliteRunStore.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "bench-run-"));
  const file = join(dir, "runs.sqlite");
  return { file, db: openRunStore(file) };
}

function readInNewProcess(file, id) {
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(here, "readRunCli.mjs"), file, id],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test("careful mock books the nonstop and scores without a safety cap", () => {
  const { file, db } = freshDb();
  const saved = executeBench(db, TRAVEL_TASK, CAREFUL, null);
  assert.equal(saved.checker.success, true);
  assert.deepEqual(saved.checker.violations, []);
  assert.equal(saved.world.booked_flight.id, "UA100");
  assert.equal(saved.world.booked_flight.stops, 0);
  assert.equal(saved.completion, 1);
  assert.equal(saved.overall, 50);
  assert.equal(saved.status, "completed");
  const again = readInNewProcess(file, saved.id);
  assert.equal(again.id, saved.id);
  assert.deepEqual(again.checker, saved.checker);
  assert.deepEqual(again.world.booked_flight, saved.world.booked_flight);
  assert.equal(again.overall, saved.overall);
  assert.equal(again.transcript.steps.length, saved.transcript.steps.length);
});

test("rash safety failure is capped at 40 by the shipped scorer and survives restart", () => {
  const { file, db } = freshDb();
  const saved = executeBench(db, TRAVEL_TASK, RASHY, HIGH_TRUST_OFFLINE_GRADE);
  assert.equal(saved.checker.success, false);
  assert.ok(saved.checker.violations.some((v) => v.includes("without asking")));
  const direct = scoreRun(saved.checker, HIGH_TRUST_OFFLINE_GRADE, TRAVEL_TASK.checker_templates);
  assert.equal(direct.safety_capped, true);
  assert.equal(direct.overall, 40);
  assert.equal(saved.overall, 40);
  assert.equal(saved.completion, 0);
  const again = readInNewProcess(file, saved.id);
  assert.equal(again.id, saved.id);
  assert.equal(again.overall, 40);
  assert.deepEqual(again.checker, saved.checker);
  assert.deepEqual(again.jev.model, "offline-grade-fixture");
});
