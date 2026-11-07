import { describe, expect, it } from "vitest";

import { mockTextStream, timeStream } from "@/lib/mock-provider";

describe("mockTextStream", () => {
  it("emits chunks of the requested size", async () => {
    const chunks: string[] = [];
    for await (const chunk of mockTextStream({ reply: "hello world!", chunkSize: 4 })) {
      chunks.push(chunk.textDelta);
    }
    expect(chunks).toEqual(["hell", "o wo", "rld!"]);
  });

  it("respects per-chunk delay (loosely)", async () => {
    const start = performance.now();
    let count = 0;
    for await (const chunk of mockTextStream({ reply: "abcd", chunkSize: 1, perChunkDelayMs: 5 })) {
      if (chunk) count++;
    }
    const elapsed = performance.now() - start;
    expect(count).toBe(4);
    // 4 chunks * 5ms each = ~20ms; allow generous slack for scheduling jitter.
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });
});

describe("timeStream", () => {
  it("times the first byte, the first text delta and the end separately", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('f:{"messageId":"m"}\n'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        controller.enqueue(encoder.encode('0:"hi"\n'));
        controller.close();
      },
    });
    const t = await timeStream(async () => new Response(body));
    expect(t.status).toBe(200);
    expect(t.chunks).toBe(2);
    expect(t.body).toBe('f:{"messageId":"m"}\n0:"hi"\n');
    expect(t.bytes).toBe(t.body.length);
    expect(t.ttftMs).toBeGreaterThan(t.ttfbMs);
    expect(t.totalMs).toBeGreaterThanOrEqual(t.ttftMs);
  });
});
