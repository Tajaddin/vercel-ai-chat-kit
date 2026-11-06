// @vitest-environment node
// Smoke test for the benchmark. We don't run the whole 200-run benchmark in
// CI (too noisy), but we do run the same handler-plus-mock setup 5 times and
// check the stream and the timings.

import { describe, expect, it } from "vitest";

import { createChatHandler } from "@/lib/chat-handler";
import { mockLanguageModel, timeStream } from "@/lib/mock-provider";

describe("ttft benchmark smoke", () => {
  it("streams the mock reply through the chat handler with ordered timings", async () => {
    const reply = "x".repeat(120);
    const handler = createChatHandler({
      accessKey: () => "k",
      model: () => mockLanguageModel({ reply, chunkSize: 4 }),
      rateLimit: { limit: Number.POSITIVE_INFINITY, windowMs: 60_000 },
    });
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer k" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      });
      const t = await timeStream(() => handler(req));
      expect(t.status).toBe(200);
      const text = t.body
        .split("\n")
        .filter((l) => l.startsWith("0:"))
        .map((l) => JSON.parse(l.slice(2)) as string)
        .join("");
      expect(text).toBe(reply);
      expect(t.ttfbMs).toBeGreaterThanOrEqual(0);
      expect(t.ttftMs).toBeGreaterThanOrEqual(t.ttfbMs);
      expect(t.totalMs).toBeGreaterThanOrEqual(t.ttftMs);
    }
  });
});
