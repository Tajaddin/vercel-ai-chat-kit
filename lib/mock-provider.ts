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
 * Convert the mock async iterable into an actual SSE-shaped ReadableStream
 * that a fetch consumer would see. Each chunk is sent as a `data: <json>\n\n`
 * line so the client parses it the way it would parse Vercel's stream.
 */
export function toSseStream(stream: AsyncIterable<StreamChunk>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const line = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Round-trip helper: pipe the mock stream into an SSE-shaped ReadableStream,
 * then read it back, recording the time-to-first-byte (TTFB) and total time.
 */
export async function timeStream(opts: MockStreamOptions): Promise<{
  ttfbMs: number;
  totalMs: number;
  textLength: number;
  chunks: number;
  bytes: number;
}> {
  const stream = toSseStream(mockTextStream(opts));
  const reader = stream.getReader();
  const start = performance.now();

  // First chunk
  const firstChunkResult = await reader.read();
  const ttfbMs = performance.now() - start;

  let chunks = firstChunkResult.done ? 0 : 1;
  let bytes = firstChunkResult.done ? 0 : firstChunkResult.value!.byteLength;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    chunks++;
    bytes += r.value!.byteLength;
  }
  const totalMs = performance.now() - start;
  return {
    ttfbMs,
    totalMs,
    textLength: opts.reply.length,
    chunks,
    bytes,
  };
}
