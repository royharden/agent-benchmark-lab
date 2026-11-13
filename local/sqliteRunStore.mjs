// Local durable runs table for synthetic bench data.
// Hosted Supabase credentials stay on hold. This store uses the same column
// set as supabase/migrations/20261010223529_create_benchmark_schema.sql and
// node:sqlite. A later process opens the same file and reads the same row.

import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  instruction TEXT NOT NULL,
  constraints TEXT NOT NULL,
  fixtures TEXT NOT NULL,
  checker_templates TEXT NOT NULL,
  has_trap INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contenders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  style TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  contender_id TEXT NOT NULL,
  status TEXT NOT NULL,
  steps INTEGER NOT NULL,
  transcript TEXT NOT NULL,
  world TEXT NOT NULL,
  checker TEXT NOT NULL,
  jev TEXT NOT NULL,
  completion REAL NOT NULL,
  trust REAL NOT NULL,
  overall REAL NOT NULL,
  jev_agrees INTEGER,
  cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function openRunStore(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(SCHEMA);
  return db;
}

export function insertTask(db, task) {
  db.prepare(
    `INSERT INTO tasks (id, title, category, difficulty, instruction, constraints, fixtures, checker_templates, has_trap, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    task.id,
    task.title,
    task.category,
    task.difficulty,
    task.instruction,
    JSON.stringify(task.constraints),
    JSON.stringify(task.fixtures),
    JSON.stringify(task.checker_templates),
    task.has_trap ? 1 : 0,
    task.created_at,
  );
}

export function insertContender(db, contender) {
  db.prepare(
    `INSERT INTO contenders (id, name, model, style) VALUES (?, ?, ?, ?)`,
  ).run(contender.id, contender.name, contender.model, contender.style);
}

export function insertRun(db, run) {
  db.prepare(
    `INSERT INTO runs (
      id, task_id, contender_id, status, steps, transcript, world, checker, jev,
      completion, trust, overall, jev_agrees, cost_usd, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.task_id,
    run.contender_id,
    run.status,
    run.steps,
    JSON.stringify(run.transcript),
    JSON.stringify(run.world),
    JSON.stringify(run.checker),
    JSON.stringify(run.jev ?? {}),
    run.completion,
    run.trust,
    run.overall,
    run.jev_agrees === null || run.jev_agrees === undefined ? null : run.jev_agrees ? 1 : 0,
    run.cost_usd,
    run.created_at,
  );
}

export function updateRun(db, id, patch) {
  const current = readRun(db, id);
  if (!current) throw new Error(`run not found: ${id}`);
  const next = { ...current, ...patch };
  db.prepare(
    `UPDATE runs SET status=?, steps=?, transcript=?, world=?, checker=?, jev=?,
      completion=?, trust=?, overall=?, jev_agrees=?, cost_usd=? WHERE id=?`,
  ).run(
    next.status,
    next.steps,
    JSON.stringify(next.transcript),
    JSON.stringify(next.world),
    JSON.stringify(next.checker),
    JSON.stringify(next.jev ?? {}),
    next.completion,
    next.trust,
    next.overall,
    next.jev_agrees === null || next.jev_agrees === undefined ? null : next.jev_agrees ? 1 : 0,
    next.cost_usd,
    id,
  );
  return readRun(db, id);
}

function rowToRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    contender_id: row.contender_id,
    status: row.status,
    steps: row.steps,
    transcript: JSON.parse(row.transcript),
    world: JSON.parse(row.world),
    checker: JSON.parse(row.checker),
    jev: JSON.parse(row.jev),
    completion: row.completion,
    trust: row.trust,
    overall: row.overall,
    jev_agrees: row.jev_agrees === null ? null : row.jev_agrees === 1,
    cost_usd: row.cost_usd,
    created_at: row.created_at,
  };
}

export function readRun(db, id) {
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id);
  return rowToRun(row);
}
