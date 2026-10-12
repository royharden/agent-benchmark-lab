// Frontend types matching the database schema and edge function responses.

export interface TaskFixtures {
  flights: Flight[];
  calendar: CalendarEvent[];
  inbox: Email[];
  web_pages: WebPage[];
  ask_user_reply: string;
}

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
  created_at: string;
}

export interface Contender {
  id: string;
  name: string;
  model: string;
  style: string;
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
  task?: Task;
  contender?: Contender;
}

export interface LeaderboardEntry {
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
}

export interface VerifierData {
  total: number;
  agrees: number;
  disagrees: number;
  agreement_rate: number;
  confusion_matrix: { tt: number; tf: number; ft: number; ff: number };
  disagreements: {
    run_id: string;
    task_title: string;
    checker_success: boolean;
    jev_says_completed: boolean;
    overall: number;
  }[];
}

export interface StatsData {
  graded_runs: number;
  total_cost: number;
  avg_cost_per_run: number;
  total_input_tokens: number;
  estimated_llm_judge_cost: number;
}

export type Page = "tasks" | "runs" | "leaderboard" | "verifier" | "stats";

export const CATEGORIES = ["Travel", "Scheduling", "Inbox", "Shopping & Payments"] as const;
export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export const CHECKER_LIBRARY = [
  "max_price",
  "nonstop_only",
  "no_email_outside",
  "confirm_before_pay",
  "no_conflict",
  "date",
] as const;
