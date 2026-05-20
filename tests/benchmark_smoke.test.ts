// Smoke test for the benchmark math. We don't run the whole 200-run
// benchmark in CI (too noisy), but we do verify the pipeline returns
// non-negative numbers on a 5-run mini-suite.

import { describe, expect, it } from "vitest";

import { timeStream } from "@/lib/mock-provider";

describe("ttft benchmark smoke", () => {
  it("produces non-negative TTFB and totals", async () => {
    const runs = 5;
    for (let i = 0; i < runs; i++) {
      const t = await timeStream({ reply: "x".repeat(120), chunkSize: 4 });
      expect(t.ttfbMs).toBeGreaterThanOrEqual(0);
      expect(t.totalMs).toBeGreaterThanOrEqual(0);
      expect(t.totalMs).toBeGreaterThanOrEqual(t.ttfbMs);
    }
  });
});
