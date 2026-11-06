// POST /api/chat handler. app/api/chat/route.ts wires it to Anthropic; tests
// and the TTFB benchmark inject a mock model.
//
// Checks run in this order, and nothing reaches the model (or spends API
// credit) until all of them pass: access key, rate limit, body size, message
// count and size. The model then gets only the role and content that were
// checked.

import { createHash, timingSafeEqual } from "node:crypto";
import { streamText, type CoreMessage, type LanguageModel } from "ai";

import { SYSTEM_PROMPT } from "@/lib/prompts";
import { tools } from "@/lib/tools";

export interface ChatLimits {
  maxBodyBytes: number;
  maxMessages: number;
  /**
   * Per user message `content`. Assistant turns are the model's own replies,
   * which can run longer; maxBodyBytes bounds them with everything else.
   */
  maxMessageChars: number;
}

export const DEFAULT_LIMITS: ChatLimits = {
  maxBodyBytes: 256 * 1024,
  maxMessages: 50,
  maxMessageChars: 8_000,
};

export interface ChatHandlerOptions {
  /**
   * Shared key callers send as `Authorization: Bearer <key>`. Unset or shorter
   * than MIN_KEY_CHARS refuses every request: wrong guesses are not rate
   * limited, so the key itself has to be unguessable.
   */
  accessKey: () => string | undefined;
  /** The model to stream from, or null when the provider is not configured. */
  model: () => LanguageModel | null;
  /** Requests allowed per window across all callers, kept in this process's memory. */
  rateLimit: { limit: number; windowMs: number };
  limits?: Partial<ChatLimits>;
  now?: () => number;
}

const MIN_KEY_CHARS = 32;
const ROLES = new Set(["user", "assistant"]);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function createChatHandler(opts: ChatHandlerOptions): (req: Request) => Promise<Response> {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const retryAfter = rateLimiter(opts.rateLimit, opts.now ?? Date.now);

  return async (req) => {
    const key = opts.accessKey();
    if (!key || key.length < MIN_KEY_CHARS) {
      return json(503, { error: `CHAT_ACCESS_KEY must be set to at least ${MIN_KEY_CHARS} characters` });
    }
    if (!hasBearer(req, key)) {
      return json(401, { error: "missing or wrong access key" }, { "www-authenticate": "Bearer" });
    }

    const wait = retryAfter();
    if (wait > 0) return json(429, { error: "rate limit exceeded" }, { "retry-after": String(wait) });

    const raw = await readBody(req, limits.maxBodyBytes);
    if (raw === null) return json(413, { error: `body over ${limits.maxBodyBytes} bytes` });
    let body: { messages?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "body is not JSON" });
    }
    const problem = checkMessages(body?.messages, limits);
    if (problem) return json(problem.status, { error: problem.error });

    const model = opts.model();
    if (!model) return json(500, { error: "model provider not configured" });

    // useChat also sends parts, tool invocations and attachments, which
    // convertToCoreMessages would prefer over content, unchecked. Earlier tool
    // results reach the model only through the assistant's own text, and an
    // assistant turn with no text (tool calls only) is dropped: Anthropic
    // rejects empty text blocks.
    const messages: CoreMessage[] = (body.messages as ChatMessage[])
      .filter((m) => m.role === "user" || m.content !== "")
      .map(({ role, content }) => ({ role, content }));

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      maxSteps: 4,
      temperature: 0,
    });
    return result.toDataStreamResponse();
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function hasBearer(req: Request, key: string): boolean {
  const match = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "");
  return match !== null && timingSafeEqual(sha256(match[1]!), sha256(key));
}

/**
 * One fixed window for every caller. They all hold the same key, and a
 * per-client id (an X-Forwarded-For hop) is whatever the caller sends, so
 * only a budget for the key as a whole bounds what the deployment spends.
 * Returns 0 if the request may proceed, else seconds to wait.
 */
function rateLimiter(
  { limit, windowMs }: { limit: number; windowMs: number },
  now: () => number,
): () => number {
  let count = 0;
  let resetAt = Number.NEGATIVE_INFINITY;
  return () => {
    const t = now();
    if (t >= resetAt) {
      count = 0;
      resetAt = t + windowMs;
    }
    if (count >= limit) return Math.max(1, Math.ceil((resetAt - t) / 1000));
    count++;
    return 0;
  };
}

/** The body as text, or null once it passes `maxBytes` (without reading the rest). */
async function readBody(req: Request, maxBytes: number): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function checkMessages(
  messages: unknown,
  limits: ChatLimits,
): { status: number; error: string } | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, error: "messages must be a non-empty array" };
  }
  if (messages.length > limits.maxMessages) {
    return { status: 413, error: `more than ${limits.maxMessages} messages` };
  }
  for (const m of messages as { role?: unknown; content?: unknown }[]) {
    if (typeof m !== "object" || m === null || !ROLES.has(m.role as string) || typeof m.content !== "string") {
      return { status: 400, error: "each message needs role user or assistant and string content" };
    }
    if (m.role === "user" && m.content.length > limits.maxMessageChars) {
      return { status: 413, error: `user message over ${limits.maxMessageChars} characters` };
    }
  }
  return null;
}
