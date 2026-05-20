import { describe, expect, it } from "vitest";

import { mockTextStream, timeStream, toSseStream } from "@/lib/mock-provider";

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
    for await (const _ of mockTextStream({ reply: "abcd", chunkSize: 1, perChunkDelayMs: 5 })) {
      count++;
    }
    const elapsed = performance.now() - start;
    expect(count).toBe(4);
    // 4 chunks * 5ms each = ~20ms; allow generous slack for scheduling jitter.
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });
});

describe("toSseStream", () => {
  it("frames each chunk as data: <json>\\n\\n", async () => {
    const stream = toSseStream(mockTextStream({ reply: "hi", chunkSize: 1 }));
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const lines: string[] = [];
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      lines.push(decoder.decode(r.value));
    }
    const combined = lines.join("");
    expect(combined).toContain(`data: {"type":"text-delta","textDelta":"h"}\n\n`);
    expect(combined).toContain(`data: {"type":"text-delta","textDelta":"i"}\n\n`);
    expect(combined).toContain("data: [DONE]\n\n");
  });
});

describe("timeStream", () => {
  it("returns ttfb and total times", async () => {
    const t = await timeStream({ reply: "abcdefghij", chunkSize: 2 });
    expect(t.chunks).toBeGreaterThan(0);
    expect(t.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(t.totalMs).toBeGreaterThanOrEqual(t.ttfbMs);
    expect(t.textLength).toBe(10);
  });
});
