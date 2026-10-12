// Validation for the task-save path: whitelisted fields, bounded strings and arrays,
// checker templates only from the code library, fixtures capped at 64 KB.

import { HttpError } from "../_shared/http.ts";
import { CHECKERS } from "../_shared/sandbox/checkers.ts";
import { jsonBytes } from "../_shared/sandbox/guards.ts";
import type { CalendarEvent, Email, Flight, TaskFixtures, WebPage } from "../_shared/sandbox/types.ts";

export const CATEGORIES = ["Travel", "Scheduling", "Inbox", "Shopping & Payments"];
export const DIFFICULTIES = ["Easy", "Medium", "Hard"];

const MAX_TITLE = 120;
const MAX_INSTRUCTION = 1000;
const MAX_CONSTRAINTS = 10;
const MAX_CONSTRAINT_CHARS = 200;
const MAX_TEMPLATES = 10;
const MAX_FIXTURE_BYTES = 64 * 1024;
const MAX_ITEMS = { flights: 50, calendar: 50, inbox: 50, web_pages: 20 };

export interface NewTask {
  title: string;
  category: string;
  difficulty: string;
  instruction: string;
  constraints: string[];
  fixtures: TaskFixtures;
  checker_templates: string[];
  has_trap: boolean;
}

function invalid(field: string): never {
  throw new HttpError(422, `invalid_field: ${field}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function requiredText(v: unknown, max: number, field: string): string {
  if (typeof v !== "string") invalid(field);
  const s = v.trim();
  if (!s || s.length > max) invalid(field);
  return s;
}

function oneOf(v: unknown, allowed: string[], field: string): string {
  if (typeof v !== "string" || !allowed.includes(v)) invalid(field);
  return v;
}

function text(v: unknown, max: number, field: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.length > max) invalid(field);
  return v;
}

function number(v: unknown, min: number, max: number, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) invalid(field);
  return v;
}

function list(v: unknown, max: number, field: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) invalid(field);
  return v;
}

function record(v: unknown, field: string): Record<string, unknown> {
  if (!isRecord(v)) invalid(field);
  return v;
}

const EMAIL_RE = /^[^\s@,:]{1,64}@[^\s@,:]{1,190}$/;

// Templates are "name" or "name:param", name from the code library, param format-checked.
function checkerTemplate(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length > 300) invalid(field);
  const parts = v.split(":");
  if (parts.length > 2) invalid(field);
  const [name, param] = parts;
  if (!Object.prototype.hasOwnProperty.call(CHECKERS, name)) invalid(field);
  if (param === undefined) return v;
  switch (name) {
    case "max_price":
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(param)) invalid(field);
      break;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) invalid(field);
      break;
    case "no_email_outside": {
      if (param === "none") break;
      const emails = param.split(",").map((s) => s.trim());
      if (emails.length > 10 || !emails.every((e) => EMAIL_RE.test(e))) invalid(field);
      break;
    }
    default:
      invalid(field);
  }
  return v;
}

function flight(v: unknown, field: string): Flight {
  const f = record(v, field);
  const out: Flight = {
    id: text(f.id, 64, `${field}.id`),
    from: text(f.from, 16, `${field}.from`),
    to: text(f.to, 16, `${field}.to`),
    date: text(f.date, 32, `${field}.date`),
    price: number(f.price, 0, 1_000_000, `${field}.price`),
    stops: number(f.stops, 0, 10, `${field}.stops`),
    depart: text(f.depart, 32, `${field}.depart`),
    arrive: text(f.arrive, 32, `${field}.arrive`),
    airline: text(f.airline, 80, `${field}.airline`),
  };
  if (f.layover !== undefined && f.layover !== null) out.layover = text(f.layover, 80, `${field}.layover`);
  return out;
}

function calendarEvent(v: unknown, field: string): CalendarEvent {
  const e = record(v, field);
  return {
    id: text(e.id, 64, `${field}.id`),
    title: text(e.title, 200, `${field}.title`),
    start: text(e.start, 40, `${field}.start`),
    end: text(e.end, 40, `${field}.end`),
  };
}

function email(v: unknown, field: string): Email {
  const e = record(v, field);
  return {
    id: text(e.id, 64, `${field}.id`),
    from: text(e.from, 254, `${field}.from`),
    subject: text(e.subject, 300, `${field}.subject`),
    body: text(e.body, 8000, `${field}.body`),
  };
}

function webPage(v: unknown, field: string): WebPage {
  const p = record(v, field);
  return {
    url: text(p.url, 500, `${field}.url`),
    title: text(p.title, 200, `${field}.title`),
    body: text(p.body, 8000, `${field}.body`),
  };
}

export function validateFixtures(raw: unknown): TaskFixtures {
  if (raw === undefined || raw === null) {
    return { flights: [], calendar: [], inbox: [], web_pages: [], ask_user_reply: "" };
  }
  const f = record(raw, "fixtures");
  if (jsonBytes(f) > MAX_FIXTURE_BYTES) throw new HttpError(422, "fixtures_too_large");
  return {
    flights: list(f.flights, MAX_ITEMS.flights, "fixtures.flights").map((x, i) => flight(x, `fixtures.flights[${i}]`)),
    calendar: list(f.calendar, MAX_ITEMS.calendar, "fixtures.calendar").map((x, i) => calendarEvent(x, `fixtures.calendar[${i}]`)),
    inbox: list(f.inbox, MAX_ITEMS.inbox, "fixtures.inbox").map((x, i) => email(x, `fixtures.inbox[${i}]`)),
    web_pages: list(f.web_pages, MAX_ITEMS.web_pages, "fixtures.web_pages").map((x, i) => webPage(x, `fixtures.web_pages[${i}]`)),
    ask_user_reply: text(f.ask_user_reply, 1000, "fixtures.ask_user_reply"),
  };
}

export function validateNewTask(body: Record<string, unknown>): NewTask {
  const constraints = list(body.constraints, MAX_CONSTRAINTS, "constraints").map((c, i) =>
    requiredText(c, MAX_CONSTRAINT_CHARS, `constraints[${i}]`)
  );
  const templates = list(body.checker_templates, MAX_TEMPLATES, "checker_templates").map((t, i) =>
    checkerTemplate(t, `checker_templates[${i}]`)
  );
  if (body.has_trap !== undefined && typeof body.has_trap !== "boolean") invalid("has_trap");

  return {
    title: requiredText(body.title, MAX_TITLE, "title"),
    category: oneOf(body.category, CATEGORIES, "category"),
    difficulty: oneOf(body.difficulty, DIFFICULTIES, "difficulty"),
    instruction: requiredText(body.instruction, MAX_INSTRUCTION, "instruction"),
    constraints,
    fixtures: validateFixtures(body.fixtures),
    checker_templates: [...new Set(templates)],
    has_trap: body.has_trap === true,
  };
}
