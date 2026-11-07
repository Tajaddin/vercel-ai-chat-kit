// Mock streaming text-only provider for tests and the no-API-key benchmark.
//
// mockTextStream yields fixed-size text deltas; mockLanguageModel wraps it in
// the AI SDK's MockLanguageModelV1 so it can stand in for Anthropic in the
// chat handler. Deterministic, no network.

import { MockLanguageModelV1 } from "ai/test";

export interface StreamChunk {
  type: "text-delta";
  textDelta: string;
}

export interface MockStreamOptions {
  reply: string;
  /** Token delay in ms. Defaults to 0 (as fast as possible). */
  perChunkDelayMs?: number;
  /** Chunk size in characters. Defaults to 4 (mimics typical SSE delta). */
  chunkSize?: number;
}

export async function* mockTextStream(opts: MockStreamOptions): AsyncIterable<StreamChunk> {
  const { reply, perChunkDelayMs = 0, chunkSize = 4 } = opts;
  for (let i = 0; i < reply.length; i += chunkSize) {
    const piece = reply.slice(i, i + chunkSize);
    if (perChunkDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, perChunkDelayMs));
    }
    yield { type: "text-delta", textDelta: piece };
  }
}

/** A language model that streams `mockTextStream(opts)` and then finishes. */
export function mockLanguageModel(opts: MockStreamOptions): MockLanguageModelV1 {
  return new MockLanguageModelV1({
    doStream: async () => ({
      stream: new ReadableStream({
        async start(controller) {
          for await (const chunk of mockTextStream(opts)) controller.enqueue(chunk);
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: { promptTokens: 0, completionTokens: 0 },
          });
          controller.close();
        },
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
}

/**
 * Time a streamed response, from calling `send` to:
 *  - ttfbMs: the first body chunk;
 *  - ttftMs: the first chunk carrying a text delta (a `0:` line in the AI SDK
 *    data stream), or the end of the body if none arrives;
 *  - totalMs: the end of the body.
 */
export async function timeStream(send: () => Promise<Response>): Promise<{
  status: number;
  ttfbMs: number;
  ttftMs: number;
  totalMs: number;
  chunks: number;
  bytes: number;
  body: string;
}> {
  const start = performance.now();
  const res = await send();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let ttfbMs: number | undefined;
  let ttftMs: number | undefined;
  let chunks = 0;
  let bytes = 0;
  let body = "";
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    ttfbMs ??= performance.now() - start;
    chunks++;
    bytes += r.value.byteLength;
    body += decoder.decode(r.value, { stream: true });
    if (ttftMs === undefined && /(^|\n)0:/.test(body)) ttftMs = performance.now() - start;
  }
  const totalMs = performance.now() - start;
  return {
    status: res.status,
    ttfbMs: ttfbMs ?? totalMs,
    ttftMs: ttftMs ?? totalMs,
    totalMs,
    chunks,
    bytes,
    body,
  };
}
