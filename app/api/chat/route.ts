// Streaming chat endpoint.
// POST /api/chat with { messages: CoreMessage[] }
//
// Backed by Anthropic via @ai-sdk/anthropic when ANTHROPIC_API_KEY is set.
// Returns a Vercel AI SDK data-stream so the @ai-sdk/react useChat hook
// can render text-delta + tool-call events with no extra plumbing.

import { anthropic } from "@ai-sdk/anthropic";
import { convertToCoreMessages, streamText } from "ai";

import { SYSTEM_PROMPT } from "@/lib/prompts";
import { tools } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: unknown };
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!process.env["ANTHROPIC_API_KEY"]) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: SYSTEM_PROMPT,
    // The useChat hook sends Message[]; convertToCoreMessages normalizes it.
    messages: convertToCoreMessages(messages as never),
    tools,
    maxSteps: 4,
    temperature: 0,
  });

  return result.toDataStreamResponse();
}
