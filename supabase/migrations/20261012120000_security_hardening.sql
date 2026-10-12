/*
# Security hardening

## Changes
1. `bump_usage(fn text, lim int) returns boolean` is replaced with a single atomic statement:
   `INSERT ... ON CONFLICT (day, fn) DO UPDATE ... WHERE calls < lim RETURNING true`.
   It no longer increments past the limit and returns false when capped (or when lim < 1).
   Still SECURITY DEFINER with `SET search_path = public`; EXECUTE is revoked from
   PUBLIC, anon and authenticated and granted only to service_role.
2. `usage_counters`: RLS stays on, any policies are dropped, and all privileges are revoked
   from anon and authenticated.
3. `tasks`, `contenders`, `runs`: any INSERT/UPDATE/DELETE/ALL policies are dropped and write
   privileges are revoked from anon and authenticated. They keep SELECT (public demo reads).
   All writes go through the edge functions with the service role key.

## Notes
- The earlier migration is not modified; this file only tightens what it created.
*/

-- ============ usage_counters: no client access at all ============
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usage_counters FROM PUBLIC, anon, authenticated;

-- ============ drop any write policies (and every usage_counters policy) ============
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        tablename = 'usage_counters'
        OR (tablename IN ('tasks', 'contenders', 'runs') AND cmd <> 'SELECT')
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END
$$;

-- ============ data tables: anon/authenticated read-only ============
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.tasks, public.contenders, public.runs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tasks, public.contenders, public.runs TO anon, authenticated;

-- ============ bump_usage: atomic, capped, service_role only ============
-- Counts one call for (today, fn) only while calls < lim. Returns true when counted,
-- false when capped. Callers treat anything other than true as capped.
CREATE OR REPLACE FUNCTION public.bump_usage(fn text, lim int)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bumped AS (
    INSERT INTO public.usage_counters AS uc (day, fn, calls)
    SELECT CURRENT_DATE, bump_usage.fn, 1
    WHERE bump_usage.lim > 0
    ON CONFLICT (day, fn) DO UPDATE
      SET calls = uc.calls + 1
      WHERE uc.calls < bump_usage.lim
    RETURNING true AS ok
  )
  SELECT COALESCE((SELECT ok FROM bumped), false);
$$;

REVOKE ALL ON FUNCTION public.bump_usage(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_usage(text, int) TO service_role;
