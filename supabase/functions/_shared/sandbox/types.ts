// Shared types for the mock tool sandbox, checkers, and scoring.

export interface Flight {
  id: string;
  from: string;
  to: string;
  date: string;
  price: number;
  stops: number;
  layover?: string;
  depart: string;
  arrive: string;
  airline: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface Email {
  id: string;
  from: string;
  subject: string;
  body: string;
}

export interface WebPage {
  url: string;
  title: string;
  body: string;
}

export interface TaskFixtures {
  flights: Flight[];
  calendar: CalendarEvent[];
  inbox: Email[];
  web_pages: WebPage[];
  ask_user_reply: string;
}

export interface TaskConstraints {
  constraints: string[];
  instruction: string;
}

export interface WorldState {
  booked_flight: Flight | null;
  sent_emails: { to: string; subject: string; body: string }[];
  payments: { amount: number; merchant: string }[];
  calendar_events: CalendarEvent[];
  asked_user: { question: string; reply: string }[];
  web_searches: { query: string; results: string }[];
  web_opens: { url: string; content: string }[];
  email_searches: { query: string; results: string }[];
  flight_searches: { from: string; to: string; date: string; results: Flight[] }[];
}

export interface TranscriptStep {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  result_str: string;
}

export interface Transcript {
  steps: TranscriptStep[];
  final_answer: string | null;
}

export interface CheckerResult {
  success: boolean;
  violations: string[];
}

export interface CheckerTemplate {
  template: string;
  param?: string;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  instruction: string;
  constraints: string[];
  fixtures: TaskFixtures;
  checker_templates: string[];
  has_trap: boolean;
}

export interface Contender {
  id: string;
  name: string;
  model: string;
  style: string;
}

export interface Run {
  id: string;
  task_id: string;
  contender_id: string;
  status: string;
  steps: number;
  transcript: Transcript;
  world: WorldState;
  checker: CheckerResult;
  jev: JevResult | null;
  completion: number;
  trust: number;
  overall: number;
  jev_agrees: boolean | null;
  cost_usd: number;
  created_at: string;
}

export interface JevAnswer {
  type: string;
  score?: number;
  confidence?: number;
  choice?: string;
  noul?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
}

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JevResult {
  answers: Record<string, JevAnswer>;
  model: string;
  usage: JevUsage;
  latency_ms: number;
  cost_usd: number;
}

export interface ToolSchema {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function emptyWorld(): WorldState {
  return {
    booked_flight: null,
    sent_emails: [],
    payments: [],
    calendar_events: [],
    asked_user: [],
    web_searches: [],
    web_opens: [],
    email_searches: [],
    flight_searches: [],
  };
}

export function emptyTranscript(): Transcript {
  return { steps: [], final_answer: null };
}
