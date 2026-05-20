import { describe, it, expect } from "vitest";
import { evalSafely, searchCorpus, calculator, search } from "@/lib/tools";

describe("evalSafely", () => {
  it("evaluates simple arithmetic", () => {
    expect(evalSafely("2 + 2")).toBe(4);
  });

  it("respects parentheses and precedence", () => {
    expect(evalSafely("(3 + 4) * 2")).toBe(14);
  });

  it("handles exponentiation right-to-left", () => {
    expect(evalSafely("2 ** 3 ** 2")).toBe(512);
  });

  it("supports unary minus", () => {
    expect(evalSafely("-3 + 5")).toBe(2);
  });

  it("returns error string on division by zero", () => {
    expect(evalSafely("1 / 0")).toMatch(/division by zero/);
  });

  it("returns error on malformed expression", () => {
    expect(evalSafely("1 +")).toMatch(/^error:/);
  });

  it("returns error on trailing garbage", () => {
    expect(evalSafely("1 + 1 foo")).toMatch(/^error:/);
  });
});

describe("searchCorpus", () => {
  it("returns matching snippets", () => {
    const hits = searchCorpus("anthropic");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.title).toBe("anthropic");
  });

  it("returns empty array on no match", () => {
    expect(searchCorpus("xyzzy")).toEqual([]);
  });

  it("returns empty array on empty query", () => {
    expect(searchCorpus("")).toEqual([]);
  });
});

describe("tool definitions", () => {
  it("calculator tool executes via its execute function", async () => {
    const out = await calculator.execute!(
      { expression: "10 / 4" },
      { toolCallId: "t1", messages: [] },
    );
    expect(out).toEqual({ result: 2.5 });
  });

  it("search tool returns up to 3 results", async () => {
    const out = await search.execute!(
      { query: "vercel ai sdk" },
      { toolCallId: "t2", messages: [] },
    );
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.length).toBeLessThanOrEqual(3);
  });
});
