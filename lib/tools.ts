// Tool definitions used by the chat API route.
// Each tool follows the Vercel AI SDK tool() shape: zod parameter schema +
// async execute function. Tools that need an LLM-side reasoning hint export
// a description that becomes part of the system prompt.

import { tool } from "ai";
import { z } from "zod";

export const calculator = tool({
  description:
    "Evaluate a single arithmetic expression. Supports +, -, *, /, %, **, parentheses.",
  parameters: z.object({
    expression: z
      .string()
      .min(1)
      .describe("Arithmetic expression, e.g. (3 + 4) * 2"),
  }),
  execute: async ({ expression }) => {
    return { result: evalSafely(expression) };
  },
});

export const search = tool({
  description:
    "Search a small offline corpus for short snippets. Returns up to 3 matching snippets.",
  parameters: z.object({
    query: z
      .string()
      .min(1)
      .describe("Search query, case-insensitive substring match."),
  }),
  execute: async ({ query }) => {
    const results = searchCorpus(query);
    return { results };
  },
});

export const tools = { calculator, search } as const;
export type ToolName = keyof typeof tools;

// ---------------------------------------------------------------------------
// Helpers

// Recursive-descent calculator that supports +, -, *, /, %, **, parentheses,
// and unary minus. Avoids `eval` so the chat backend cannot accidentally run
// arbitrary code.
export function evalSafely(input: string): number | string {
  try {
    const parser = new ExprParser(input);
    const value = parser.parseExpression();
    parser.expectEnd();
    if (!Number.isFinite(value)) {
      return "error: non-finite result";
    }
    return value;
  } catch (err) {
    return `error: ${(err as Error).message}`;
  }
}

class ExprParser {
  private pos = 0;
  constructor(private input: string) {}

  parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipWs();
      const ch = this.peek();
      if (ch === "+" || ch === "-") {
        this.pos++;
        const right = this.parseTerm();
        value = ch === "+" ? value + right : value - right;
      } else {
        break;
      }
    }
    return value;
  }

  parseTerm(): number {
    let value = this.parsePower();
    while (true) {
      this.skipWs();
      const ch = this.peek();
      if (ch === "*" || ch === "/" || ch === "%") {
        this.pos++;
        const right = this.parsePower();
        if (ch === "*") value *= right;
        else if (ch === "/") {
          if (right === 0) throw new Error("division by zero");
          value /= right;
        } else {
          value %= right;
        }
      } else {
        break;
      }
    }
    return value;
  }

  parsePower(): number {
    const base = this.parseUnary();
    this.skipWs();
    if (this.input.startsWith("**", this.pos)) {
      this.pos += 2;
      const exp = this.parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }

  parseUnary(): number {
    this.skipWs();
    const ch = this.peek();
    if (ch === "-") {
      this.pos++;
      return -this.parseUnary();
    }
    if (ch === "+") {
      this.pos++;
      return this.parseUnary();
    }
    return this.parseAtom();
  }

  parseAtom(): number {
    this.skipWs();
    if (this.peek() === "(") {
      this.pos++;
      const v = this.parseExpression();
      this.skipWs();
      if (this.peek() !== ")") throw new Error("missing closing paren");
      this.pos++;
      return v;
    }
    const start = this.pos;
    while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos]!)) {
      this.pos++;
    }
    if (start === this.pos) throw new Error(`unexpected character at ${this.pos}`);
    const num = Number(this.input.slice(start, this.pos));
    if (Number.isNaN(num)) throw new Error(`invalid number at ${start}`);
    return num;
  }

  expectEnd(): void {
    this.skipWs();
    if (this.pos !== this.input.length) {
      throw new Error(`unexpected trailing input at ${this.pos}`);
    }
  }

  skipWs(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos]!)) {
      this.pos++;
    }
  }

  peek(): string | undefined {
    return this.input[this.pos];
  }
}

const CORPUS: Record<string, string[]> = {
  anthropic: [
    "Anthropic is an AI safety company based in San Francisco. Its main product is the Claude family of LLMs.",
  ],
  "claude haiku": [
    "Claude Haiku 4.5 is a small, fast model in the Claude 4 family. It supports prompt caching, tool use, and structured outputs.",
  ],
  "vercel ai sdk": [
    "The Vercel AI SDK is a TypeScript-first toolkit for building chat and agent UIs. Core primitives: streamText, useChat, tool.",
  ],
  "tool use": [
    "Tool use in the Vercel AI SDK exposes parameters via zod schemas and execute functions. The model decides which tool to call.",
  ],
  citations: [
    "Citations are emitted by including a structured tool result that lists the snippet sources. The UI renders them as footnotes.",
  ],
};

export function searchCorpus(query: string): { title: string; snippet: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { title: string; snippet: string }[] = [];
  for (const [key, snippets] of Object.entries(CORPUS)) {
    if (key.includes(q) || q.includes(key)) {
      for (const snippet of snippets) {
        hits.push({ title: key, snippet });
        if (hits.length >= 3) return hits;
      }
    }
  }
  return hits;
}
