/*
# Personal Agent Benchmark Lab — Schema

## Overview
Creates the full schema for the Personal Agent Benchmark Lab: a public demo workspace
for benchmarking LLM agents against mock tools with code checkers and a Jev verifier.

## New Tables
1. `tasks` — task definitions (title, category, difficulty, instruction, constraints, fixtures, checker templates, trap flag)
2. `contenders` — model × style contenders (name, model, style)
3. `runs` — individual run records (task, contender, status, steps, transcript, world state, checker result, Jev result, scores)
4. `usage_counters` — daily per-function call counters for the usage cap (no anon/authenticated policies)

## Security
- RLS enabled on ALL tables.
- `tasks`, `contenders`, `runs` get anon read-only SELECT policies (public demo).
- `usage_counters` gets NO policies — only the SECURITY DEFINER `bump_usage` function can access it.
- No anon INSERT/UPDATE/DELETE policies anywhere — all writes go through edge functions using the service role key.
- `bump_usage(fn text, lim int) returns boolean` — SECURITY DEFINER, atomic upsert of daily counter, returns false when over limit.
  - `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` so only the service role can call it.

## Important Notes
1. Single-tenant, no-auth app. All policies use `TO anon, authenticated` for SELECT only.
2. The `bump_usage` function uses `set search_path = public` and is SECURITY DEFINER.
3. Runs store transcript and world state as JSONB so edge functions can update them incrementally.
*/

-- ============ tasks ============
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL,
  instruction text NOT NULL,
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixtures jsonb NOT NULL DEFAULT '{}'::jsonb,
  checker_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_trap boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tasks" ON tasks;
CREATE POLICY "anon_select_tasks" ON tasks FOR SELECT
  TO anon, authenticated USING (true);

-- ============ contenders ============
CREATE TABLE IF NOT EXISTS contenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  model text NOT NULL,
  style text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contenders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_contenders" ON contenders;
CREATE POLICY "anon_select_contenders" ON contenders FOR SELECT
  TO anon, authenticated USING (true);

-- ============ runs ============
CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  contender_id uuid NOT NULL REFERENCES contenders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  steps int NOT NULL DEFAULT 0,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  world jsonb NOT NULL DEFAULT '{}'::jsonb,
  checker jsonb NOT NULL DEFAULT '{}'::jsonb,
  jev jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion int NOT NULL DEFAULT 0,
  trust numeric NOT NULL DEFAULT 0,
  overall numeric NOT NULL DEFAULT 0,
  jev_agrees boolean,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_task_id ON runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_contender_id ON runs(contender_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_runs" ON runs;
CREATE POLICY "anon_select_runs" ON runs FOR SELECT
  TO anon, authenticated USING (true);

-- ============ usage_counters ============
CREATE TABLE IF NOT EXISTS usage_counters (
  day date NOT NULL,
  fn text NOT NULL,
  calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, fn)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER bump_usage can access this table.

-- ============ bump_usage function ============
-- Atomically increments the daily counter for a function and returns false if over limit.
-- SECURITY DEFINER so edge functions (service role) can call it; revoked from PUBLIC/anon/authenticated.
CREATE OR REPLACE FUNCTION bump_usage(fn text, lim int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_calls int;
BEGIN
  -- Try to increment existing counter
  UPDATE usage_counters
    SET calls = calls + 1
    WHERE day = CURRENT_DATE AND usage_counters.fn = bump_usage.fn
    RETURNING calls INTO current_calls;

  IF current_calls IS NULL THEN
    -- No row yet, insert one with calls = 1
    INSERT INTO usage_counters (day, fn, calls)
      VALUES (CURRENT_DATE, bump_usage.fn, 1)
      ON CONFLICT (day, fn) DO UPDATE SET calls = usage_counters.calls + 1
      RETURNING calls INTO current_calls;
  END IF;

  -- Return false if over the limit (fail closed)
  RETURN current_calls <= lim;
END;
$$;

REVOKE EXECUTE ON FUNCTION bump_usage(text, int) FROM PUBLIC, anon, authenticated;