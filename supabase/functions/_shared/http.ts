// HTTP helpers shared by the edge functions: CORS, JSON responses, size-capped body
// parsing, and the service-role client (built only from env, never from the request).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonError(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

export function preflight(): Response {
  return new Response("ok", { status: 200, headers: corsHeaders });
}

// Turns any thrown error into a response. Only HttpError messages (which we write
// ourselves) reach the client; everything else is logged and returned as a generic 500.
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return jsonError(err.status, err.message);
  console.error("Unhandled error:", err);
  return jsonError(500, "internal_error");
}

let serviceClient: SupabaseClient | null = null;

// Returns null when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing so callers can 503.
export function getServiceClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    return null;
  }
  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// Reads a JSON object body, rejecting anything over maxBytes with 413 before parsing.
export async function readJsonBody(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "payload_too_large");
  if (!req.body) throw new HttpError(400, "invalid_json");
  const bytes = await readCapped(req.body, maxBytes);
  if (!bytes) throw new HttpError(413, "payload_too_large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "invalid_json");
  return parsed as Record<string, unknown>;
}

// Reads an upstream response body as text with a size cap (throws past the cap).
export async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const bytes = await readCapped(res.body, maxBytes);
  if (!bytes) throw new Error(`upstream response exceeded ${maxBytes} bytes`);
  return new TextDecoder().decode(bytes);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
