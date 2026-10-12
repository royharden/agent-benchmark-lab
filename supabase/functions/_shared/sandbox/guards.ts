// Size guards and normalizers for everything the sandbox stores per run, so stored
// transcripts and world state stay bounded whatever the model (or a fixture) produces.

import { TOOL_SCHEMAS } from "./tools.ts";
import type { TaskFixtures, Transcript, TranscriptStep, WorldState } from "./types.ts";

export const MAX_STEPS = 12;
export const MAX_TOOL_RESULT_CHARS = 4096;
export const MAX_ARG_CHARS = 1000;
export const MAX_FINAL_ANSWER_CHARS = 4000;
export const MAX_RUN_STATE_BYTES = 200 * 1024;

const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function clampString(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "...";
}

// Deep-copies a JSON-ish value, truncating long strings and arrays and dropping
// anything that isn't plain JSON.
export function clampDeep(value: unknown, maxString = MAX_TOOL_RESULT_CHARS, depth = 0): unknown {
  if (typeof value === "string") return clampString(value, maxString);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean" || value === null) return value;
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((v) => clampDeep(v, maxString, depth + 1));
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      if (v === undefined) continue;
      out[k] = clampDeep(v, maxString, depth + 1);
    }
    return out;
  }
  return null;
}

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

// Raw tool results are stored for reference only; anything over the cap is replaced.
export function clampToolResult(result: unknown): unknown {
  const clamped = clampDeep(result);
  return jsonBytes(clamped) <= MAX_TOOL_RESULT_CHARS ? clamped : { truncated: true };
}

// Keeps only the arguments a tool declares, with bounded strings.
export function sanitizeToolArgs(tool: string, raw: unknown): Record<string, unknown> {
  const schema = TOOL_SCHEMAS.find((s) => s.function.name === tool);
  const props = schema?.function.parameters.properties;
  if (!schema || !isRecord(props) || !isRecord(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    const v = raw[key];
    if (typeof v === "string") out[key] = clampString(v, MAX_ARG_CHARS);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

export function normalizeFixtures(raw: unknown): TaskFixtures {
  const f = isRecord(raw) ? raw : {};
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v.filter(isRecord) as T[]) : []);
  return {
    flights: arr(f.flights),
    calendar: arr(f.calendar),
    inbox: arr(f.inbox),
    web_pages: arr(f.web_pages),
    ask_user_reply: typeof f.ask_user_reply === "string" ? f.ask_user_reply : "",
  };
}

export function normalizeTranscript(raw: unknown): Transcript {
  const t = isRecord(raw) ? raw : {};
  return {
    steps: Array.isArray(t.steps) ? (t.steps.filter(isRecord) as unknown as TranscriptStep[]) : [],
    final_answer: typeof t.final_answer === "string" ? t.final_answer : null,
  };
}

export function normalizeWorld(raw: unknown): WorldState {
  const w = isRecord(raw) ? raw : {};
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    booked_flight: isRecord(w.booked_flight) ? (w.booked_flight as unknown as WorldState["booked_flight"]) : null,
    sent_emails: arr(w.sent_emails),
    payments: arr(w.payments),
    calendar_events: arr(w.calendar_events),
    asked_user: arr(w.asked_user),
    web_searches: arr(w.web_searches),
    web_opens: arr(w.web_opens),
    email_searches: arr(w.email_searches),
    flight_searches: arr(w.flight_searches),
  };
}

export function normalizeStringList(raw: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === "string")
    .slice(0, maxItems)
    .map((s) => clampString(s, maxChars));
}
