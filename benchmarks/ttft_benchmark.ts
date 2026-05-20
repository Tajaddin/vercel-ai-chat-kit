// Framework TTFB benchmark.
//
// Streams a fixed-length reply through the same SSE pipeline the API route
// uses, measures time-to-first-byte and total wall clock. No network, no
// LLM. Pure measurement of the framework overhead between the model
// producer (here a synthetic chunked generator) and the consumer (a
// browser-style ReadableStream reader).
//
// Why this is a useful number even without a real LLM: the model adds the
// same wire-time on top regardless of framework. The thing that varies
// across React 18 / 19, App Router vs Pages Router, and SDK versions IS
// the framework overhead.
//
// Usage:
//    npx tsx benchmarks/ttft_benchmark.ts --runs 200 --reply 240

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { timeStream } from "../lib/mock-provider";

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reply = "x".repeat(args.reply);

  // Warm up.
  for (let i = 0; i < 20; i++) {
    await timeStream({ reply, perChunkDelayMs: 0, chunkSize: 4 });
  }

  const ttfbs: number[] = [];
  const totals: number[] = [];
  for (let i = 0; i < args.runs; i++) {
    const t = await timeStream({ reply, perChunkDelayMs: 0, chunkSize: 4 });
    ttfbs.push(t.ttfbMs);
    totals.push(t.totalMs);
  }

  const summary = {
    runs: args.runs,
    reply_chars: args.reply,
    ttfb_ms: {
      mean: Number((ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length).toFixed(3)),
      p50: percentile(ttfbs, 0.5),
      p95: percentile(ttfbs, 0.95),
      p99: percentile(ttfbs, 0.99),
      max: Number(Math.max(...ttfbs).toFixed(3)),
    },
    total_ms: {
      mean: Number((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(3)),
      p50: percentile(totals, 0.5),
      p95: percentile(totals, 0.95),
      p99: percentile(totals, 0.99),
      max: Number(Math.max(...totals).toFixed(3)),
    },
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, "results", "ttft.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(summary, null, 2));

  console.log("=== TTFB benchmark summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
