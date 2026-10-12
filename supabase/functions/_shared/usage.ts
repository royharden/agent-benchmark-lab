// Daily usage cap. Every upstream paid request (OpenAI, TypeSafe/Jev) goes through
// paidFetch, which bumps the counter right before each attempt and fails closed.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const DEFAULT_DAILY_CALL_LIMIT = 200;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

export function limitFromEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function dailyCallLimit(): number {
  return limitFromEnv("DAILY_CALL_LIMIT", DEFAULT_DAILY_CALL_LIMIT);
}

export type UsageVerdict =
  | { ok: true }
  | { ok: false; status: 429 | 503; error: string };

// bump_usage returns true only when the call was counted under the limit. An RPC error
// is 503; false, null or anything other than true is treated as capped (429).
export async function bumpUsage(supabase: SupabaseClient, fn: string, lim: number): Promise<UsageVerdict> {
  try {
    const { data, error } = await supabase.rpc("bump_usage", { fn, lim });
    if (error) {
      console.error(`bump_usage(${fn}) failed:`, error.message);
      return { ok: false, status: 503, error: "usage_unavailable" };
    }
    if (data !== true) return { ok: false, status: 429, error: "daily_cap" };
    return { ok: true };
  } catch (err) {
    console.error(`bump_usage(${fn}) threw:`, err);
    return { ok: false, status: 503, error: "usage_unavailable" };
  }
}

export type PaidFetchResult =
  | { kind: "ok"; response: Response; latencyMs: number }
  | { kind: "capped"; status: 429 | 503; error: string }
  | { kind: "failed"; status?: number };

// Sends an upstream paid request. At most 2 attempts; each attempt is counted right
// before its fetch. Retries only on 429, 529 or a network error, and never after the
// cap is hit. Upstream error text is logged here and never returned.
export async function paidFetch(opts: {
  supabase: SupabaseClient;
  fn: string;
  url: string;
  init: RequestInit;
  timeoutMs: number;
}): Promise<PaidFetchResult> {
  const limit = dailyCallLimit();
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const verdict = await bumpUsage(opts.supabase, opts.fn, limit);
    if (!verdict.ok) return { kind: "capped", status: verdict.status, error: verdict.error };

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(opts.url, {
        ...opts.init,
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      console.error(`${opts.fn}: upstream network error (attempt ${attempt}):`, String(err));
      lastStatus = undefined;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return { kind: "failed" };
    }

    if (response.ok) return { kind: "ok", response, latencyMs: Date.now() - started };

    lastStatus = response.status;
    const detail = await response.text().catch(() => "");
    console.error(`${opts.fn}: upstream ${response.status} (attempt ${attempt}): ${detail.slice(0, 500)}`);
    if ((response.status === 429 || response.status === 529) && attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    return { kind: "failed", status: response.status };
  }

  return { kind: "failed", status: lastStatus };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
