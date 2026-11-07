// Chat handler TTFB benchmark.
//
// Sends POST requests straight into the chat handler (lib/chat-handler.ts,
// the code app/api/chat/route.ts exports) with the Anthropic model swapped
// for the mock in lib/mock-provider.ts. Each request goes through the access
// key check, rate limiter, body read and validation, streamText with the
// tools, and toDataStreamResponse. Timed from calling the
// handler (the Request is built beforehand) to the first body byte (TTFB),
// the first text delta (TTFT) and the end of the stream.
//
// Not measured: Next.js's HTTP server, the network, and the model itself,
// which here streams the reply in 4-char deltas with no delay. A real model's
// time to first token adds on top.
//
// Usage:
//    npx tsx benchmarks/ttft_benchmark.ts --runs 200 --reply 240

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createChatHandler } from "../lib/chat-handler";
import { mockLanguageModel, timeStream } from "../lib/mock-provider";

interface Args {
  runs: number;
  reply: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { runs: 200, reply: 240 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs" && argv[i + 1]) {
      args.runs = Number(argv[i + 1]);
      i++;
    } else if (argv[i] === "--reply" && argv[i + 1]) {
      args.reply = Number(argv[i + 1]);
      i++;
    }
  }
  return args;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return Number(sorted[idx]!.toFixed(3));
}

function stats(values: number[]) {
  return {
    mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Number(Math.max(...values).toFixed(3)),
  };
}

const KEY = "benchmark-access-key-0123456789abcdef";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reply = "x".repeat(args.reply);
  const handler = createChatHandler({
    accessKey: () => KEY,
    model: () => mockLanguageModel({ reply, perChunkDelayMs: 0, chunkSize: 4 }),
    rateLimit: { limit: Number.POSITIVE_INFINITY, windowMs: 60_000 },
  });
  const request = () =>
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

  async function once() {
    const req = request();
    const t = await timeStream(() => handler(req));
    if (t.status !== 200) throw new Error(`handler returned ${t.status}: ${t.body}`);
    return t;
  }

  // Warm up.
  for (let i = 0; i < 20; i++) await once();

  const ttfbs: number[] = [];
  const ttfts: number[] = [];
  const totals: number[] = [];
  for (let i = 0; i < args.runs; i++) {
    const t = await once();
    ttfbs.push(t.ttfbMs);
    ttfts.push(t.ttftMs);
    totals.push(t.totalMs);
  }

  const summary = {
    runs: args.runs,
    reply_chars: args.reply,
    node: process.version,
    ttfb_ms: stats(ttfbs),
    ttft_ms: stats(ttfts),
    total_ms: stats(totals),
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, "results", "ttft.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(summary, null, 2));

  console.log("=== Chat handler TTFB benchmark summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
