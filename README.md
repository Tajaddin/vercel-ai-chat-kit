# vercel-ai-chat-kit

> Production-shape Next.js 15 + Vercel AI SDK chat. **Framework TTFB p99 = 16μs**, full streaming SSE pipeline, tool calls with footnote citations, abort + regenerate, 100% TypeScript strict, 123 kB First Load JS. 19 tests, reproducible benchmarks in seconds.

[![ci](https://github.com/Tajaddin/vercel-ai-chat-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Tajaddin/vercel-ai-chat-kit/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-blue)](package.json)

## Hero metrics

Framework overhead measured against the same SSE pipeline the chat API uses. The LLM adds whatever wire-time it adds. The numbers below are what the chat plumbing costs *on top*.

Reproducible: `npx tsx benchmarks/ttft_benchmark.ts --runs 200 --reply 240`

| Metric | p50 | p95 | p99 |
|---|---:|---:|---:|
| **Time-to-first-byte (framework)** | **5 μs** | 9 μs | **16 μs** |
| Total stream (240 chars in 4-char chunks) | 166 μs | 392 μs | 540 μs |

Real-world TTFB on the live Anthropic API is bounded by Claude's TTFT (typically 150-400 ms for Haiku 4.5). The framework adds ~5 μs.

Bundle size:
- **First Load JS for `/`: 123 kB** (Next.js 15 App Router, React 19, full chat + tool rendering + citations)
- API route `/api/chat`: 123 B
- The whole production tree (`.next/standalone`) is what the Docker image ships.

## What you get

| Path | Purpose |
|---|---|
| `app/api/chat/route.ts` | Streaming POST endpoint. Uses `streamText` from the Vercel AI SDK with Anthropic Haiku 4.5 + tools. Returns a data-stream response that `useChat` consumes. |
| `app/page.tsx` + `components/chat.tsx` | Chat UI with `useChat` from `@ai-sdk/react`. Streaming text, tool-call rendering, abort, regenerate, footnote citations. |
| `lib/tools.ts` | Two tools: `calculator` (recursive-descent parser, no `eval`) and `search` (offline corpus). Both follow the AI SDK `tool({ description, parameters, execute })` shape. |
| `lib/prompts.ts` | The system prompt. Stable across calls so the Anthropic provider can prompt-cache it. |
| `lib/mock-provider.ts` | Chunked async iterable + SSE framer + timing helper. Used by tests and the TTFB benchmark to remove the network from the measurement. |
| `benchmarks/ttft_benchmark.ts` | 200-run TTFB + total measurement of the framework. Writes JSON to `benchmarks/results/`. |
| `tests/` | Vitest + Testing Library. 19 tests covering tool parsing, mock streaming, SSE framing, citation rendering, benchmark math. |

## Why this matters for production

Recruiter signal this maps to:
- **AI Product Engineer** (Blackboard, Worth AI, Bitovi, Temporal AI SDK, Honor)
- **Streaming chat UIs with tool calls** (most "Sr Front-End on AI team" JDs in 2026)
- **Next.js 15 App Router + React 19** (the contemporary stack)
- **TypeScript strict + bundle-size discipline** (123 kB First Load JS is the receipt)

The Vercel AI SDK gives you primitives. This kit shows what to build with them and the framework cost of doing it.

## Quick start

```bash
npm install
cp .env.example .env.local
# add ANTHROPIC_API_KEY=sk-ant-...
npm run dev
# open http://localhost:3001
```

Ask: *"What is (3 + 4) * 2, and what is the Vercel AI SDK?"*

Expected behavior:
1. Model calls the `calculator` tool with `expression="(3 + 4) * 2"`, gets `14`.
2. Model calls the `search` tool with `query="vercel ai sdk"`, gets one snippet.
3. Streams a one-sentence answer with `[1]` superscript footnote linking to the snippet at the bottom of the bubble.
4. `stop` button is visible while streaming; `regenerate` button after.

## Streaming pipeline

```
useChat()                           streamText()                   anthropic()
   |                                     |                               |
   | POST /api/chat                      |                               |
   |------------------------------------>|                               |
   |                                     | convertToCoreMessages         |
   |                                     | system + tools                |
   |                                     |------------------------------>|
   |                                     | toDataStreamResponse          |
   |                                     |<------------------------------|
   |<------------------------------------|                               |
   |  text-delta, tool-call, tool-result, finish                         |
   |                                                                    |
   v                                                                    v
React message parts render incrementally                       Anthropic produces
                                                               text + tool deltas
```

The browser sees a `ReadableStream<Uint8Array>` of `data: ...\n\n` lines. `useChat` parses them and incrementally pushes parts onto each message. Our `Message` component knows how to render four part types: text, tool-invocation (running), tool-invocation (result), and the implicit citations the `search` tool emits.

## Citation rendering

The system prompt tells Claude to cite via `[title]` markers. The component:

1. Collects every `tool-invocation` part where `toolName === "search"`.
2. Flattens `tool_result.results` into a citation list with stable indices.
3. Replaces each `[title]` in the assistant's text with a `<a class="citation">` superscript footnote linking to `#cite-N`.
4. Renders the full citation list at the bottom of the bubble.

This is in `components/message.tsx` and `components/citation.tsx`. Each is under 100 lines.

## Testing

```bash
npm test
```

19 tests across:
- **`tools.test.ts`** — calculator handles `+`, `-`, `*`, `/`, `%`, `**`, unary minus, parens, division by zero, trailing garbage. Search returns matching snippets and rejects empty queries.
- **`mock-provider.test.ts`** — chunked async iterable, per-chunk delay, SSE framing (`data: <json>\n\n`).
- **`citation.test.tsx`** — render component with multiple citations, with empty list.
- **`benchmark_smoke.test.ts`** — micro-bench math returns sane numbers.

## Docker

```bash
docker compose up app
# open http://localhost:3001
```

Multi-stage build, alpine base, runs as non-root `nextjs` user, ships only the `.next/standalone` output. Production image is small (~200 MB) and starts fast.

## Project layout

```
app/
  api/chat/route.ts        # streamText + tools + toDataStreamResponse
  page.tsx                 # server component, mounts <Chat />
  layout.tsx
  globals.css

components/
  chat.tsx                 # useChat + composer + stop/regenerate
  message.tsx              # text + tool-invocation + citations
  citation.tsx             # footnote-style citation list

lib/
  tools.ts                 # calculator + search
  prompts.ts               # SYSTEM_PROMPT (cacheable)
  mock-provider.ts         # chunked stream + SSE framing + timing

benchmarks/
  ttft_benchmark.ts        # 200-run TTFB + total measurement
  results/
    ttft.json

tests/                     # 19 vitest tests
```

## What this is NOT

- A theme switcher (one mode: dark). Adding it is a 30-line PR.
- A persistence layer. Conversation history lives in the browser; on reload it is gone. Adding it is a `kv.set/get` call.
- A multi-user app. Single-user, single-conversation by design. Multi-user is the next iteration.

## License

MIT
