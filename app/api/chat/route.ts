// Streaming chat endpoint.
// POST /api/chat with { messages: CoreMessage[] } and
// `Authorization: Bearer $CHAT_ACCESS_KEY`.
//
// Backed by Anthropic via @ai-sdk/anthropic when ANTHROPIC_API_KEY is set.
// Returns a Vercel AI SDK data-stream so the @ai-sdk/react useChat hook
// can render text-delta + tool-call events with no extra plumbing.
// Access key, rate limit and size checks live in lib/chat-handler.ts.

import { anthropic } from "@ai-sdk/anthropic";

import { createChatHandler } from "@/lib/chat-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = createChatHandler({
  accessKey: () => process.env["CHAT_ACCESS_KEY"],
  model: () =>
    process.env["ANTHROPIC_API_KEY"] ? anthropic("claude-haiku-4-5-20251001") : null,
  rateLimit: { limit: 20, windowMs: 60_000 },
});
