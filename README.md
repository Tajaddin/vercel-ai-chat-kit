# vercel-ai-chat-kit

> Production-shape Next.js 15 + Vercel AI SDK chat. **Chat API handler TTFB 0.50 ms p50** (in-process, mock model), streaming responses, tool calls with footnote citations, abort + regenerate, access-key gate, rate limit and request size limits on the chat API, 100% TypeScript strict, 124 kB First Load JS. 32 tests, reproducible benchmarks in seconds.

[![ci](https://github.com/Tajaddin/vercel-ai-chat-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Tajaddin/vercel-ai-chat-kit/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-blue)](package.json)

## Hero metrics

What the chat API itself costs per request, before the model's own latency. The benchmark sends POST requests straight into the handler that `app/api/chat/route.ts` exports (`createChatHandler` in `lib/chat-handler.ts`), with the Anthropic model swapped for a mock that streams 240 characters in 4-character deltas with no delay. Each request goes through the access-key check, rate limiter, body read and validation, `streamText` with both tools, and `toDataStreamResponse`. Timing starts when the handler is called. It is in-process: Next.js's HTTP server, the network and the model are not in these numbers.

Reproducible: `npx tsx benchmarks/ttft_benchmark.ts --runs 200 --reply 240`

| 200 runs after 20 warm-up, Node 24.14, i5-13600KF | p50 | p95 | p99 |
|---|---:|---:|---:|
| **Time to first byte** | **0.50 ms** | 1.27 ms | 3.27 ms |
| Time to first text delta | 0.54 ms | 1.37 ms | 3.33 ms |
| Total stream (240 chars in 4-char deltas) | 2.46 ms | 5.55 ms | 7.46 ms |

The tail is noisy: over three back-to-back runs, TTFB p50 stayed at 0.50-0.55 ms while p99 ranged from 3.3 to 6.5 ms. Raw output: `benchmarks/results/ttft.json`.

Real-world TTFB on the live Anthropic API is bounded by Claude's TTFT (typically 150-400 ms for Haiku 4.5). The handler adds about half a millisecond at the median.

Bundle size:
- **First Load JS for `/`: 124 kB** (`next build`; Next.js 15 App Router, React 19, full chat + tool rendering + citations)
- API route `/api/chat`: 123 B
- The whole production tree (`.next/standalone`) is what the Docker image ships.

## What you get

| Path | Purpose |
|---|---|
| `app/api/chat/route.ts` | Streaming POST endpoint: wires `lib/chat-handler.ts` to Anthropic Haiku 4.5. |
| `lib/chat-handler.ts` | Access key, rate limit, body and message limits, then `streamText` with the tools. Returns a data-stream response that `useChat` consumes. The model is injected, so tests and the benchmark run it with a mock. |
| `app/page.tsx` + `components/chat.tsx` | Chat UI with `useChat` from `@ai-sdk/react`. Streaming text, tool-call rendering, abort, regenerate, footnote citations. |
| `lib/tools.ts` | Two tools: `calculator` (recursive-descent parser, no `eval`) and `search` (offline corpus). Both follow the AI SDK `tool({ description, parameters, execute })` shape. |
| `lib/prompts.ts` | The system prompt. Stable across calls so the Anthropic provider can prompt-cache it. |
| `lib/mock-provider.ts` | Chunked async iterable, a mock AI SDK model built on it, and a response timing helper. Used by tests and the TTFB benchmark to take the network and the LLM out of the measurement. |
| `benchmarks/ttft_benchmark.ts` | 200-run TTFB, first-text-delta and total measurement of the chat handler with the mock model. Writes JSON to `benchmarks/results/`. |
| `tests/` | Vitest + Testing Library. 32 tests covering the chat handler's checks, tool parsing, mock streaming, response timing, citation rendering, the benchmark setup. |

## Why this matters for production

Recruiter signal this maps to:
- **AI Product Engineer** (Blackboard, Worth AI, Bitovi, Temporal AI SDK, Honor)
- **Streaming chat UIs with tool calls** (most "Sr Front-End on AI team" JDs in 2026)
- **Next.js 15 App Router + React 19** (the contemporary stack)
- **TypeScript strict + bundle-size discipline** (124 kB First Load JS is the receipt)

The Vercel AI SDK gives you primitives. This kit shows what to build with them and the framework cost of doing it.

## Quick start

```bash
npm install
cp .env.example .env.local
# add ANTHROPIC_API_KEY=sk-ant-...
# and CHAT_ACCESS_KEY=$(openssl rand -hex 32)
npm run dev
# open http://localhost:3001 and paste CHAT_ACCESS_KEY into the "Access key" field
```

Ask: *"What is (3 + 4) * 2, and what is the Vercel AI SDK?"*

Expected behavior:
1. Model calls the `calculator` tool with `expression="(3 + 4) * 2"`, gets `14`.
2. Model calls the `search` tool with `query="vercel ai sdk"`, gets one snippet.
3. Streams a one-sentence answer with `[1]` superscript footnote linking to the snippet at the bottom of the bubble.
4. `stop` button is visible while streaming; `regenerate` button after.

## Access control

`/api/chat` spends the deployment's Anthropic key, so it does nothing for anonymous callers:

- **Access key.** Every request needs `Authorization: Bearer $CHAT_ACCESS_KEY` (compared in constant time). While `CHAT_ACCESS_KEY` is unset the route answers 503 to everyone; a missing or wrong key gets 401. The UI's "Access key" field sends it and keeps it in `sessionStorage` for the tab.
- **Rate limit.** 20 requests per minute per client, keyed by the first `X-Forwarded-For` hop, answered with 429 and `Retry-After`. The counter lives in process memory, so each instance counts separately, and the client id is only as trustworthy as the proxy that sets the header.
- **Size limits.** Bodies over 256 KiB get 413 (the body is read up to the limit, not buffered whole), as do more than 50 messages or a user message over 8,000 characters. Assistant messages are the model's own replies and can run longer, so they have no cap of their own; the 256 KiB body limit bounds the conversation as a whole. Messages must be `user` or `assistant` with string content; anything else, including client-sent `system` messages, gets 400.
- **Only checked text reaches the model.** `useChat` also sends `parts`, tool invocations and attachments, which the AI SDK would otherwise turn into the prompt instead of `content`. The handler passes the model each message's role and content and nothing else, so the limits above cover everything it reads. The cost: tool calls and results from earlier turns reach the model only through the assistant's own text.

A request reaches the model only after passing all of them. To use your app's sessions instead of a shared key, replace the bearer check in `lib/chat-handler.ts` with your session lookup.

## Streaming pipeline

```
useChat()                           streamText()                   anthropic()
   |                                     |                               |
   | POST /api/chat                      |                               |
   |------------------------------------>|                               |
   |                                     | checked role + content only   |
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

The browser sees a `ReadableStream<Uint8Array>` in the AI SDK data stream format: one `TYPE:JSON` line per part (`0:"text"` for a text delta). `useChat` parses them and incrementally pushes parts onto each message. Our `Message` component knows how to render four part types: text, tool-invocation (running), tool-invocation (result), and the implicit citations the `search` tool emits.

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

32 tests across:
- **`chat-handler.test.ts`** — streams the mock model's reply with the right key; 503 with no key configured; 401 for a missing or wrong key; per-client rate limit and window reset; 413 for body, message count and user message length, while a long assistant reply does not lock the conversation; 400 for bad JSON, roles and shapes. None of the rejected requests reaches the model, and the model's prompt holds only each message's role and content (no `parts`, tool results or attachments).
- **`route.test.ts`** — the real route refuses unauthenticated requests without calling Anthropic.
- **`chat.test.tsx`** — the UI sends the access key as a bearer token.
- **`tools.test.ts`** — calculator handles `+`, `-`, `*`, `/`, `%`, `**`, unary minus, parens, division by zero, trailing garbage. Search returns matching snippets and rejects empty queries.
- **`mock-provider.test.ts`** — chunked async iterable, per-chunk delay, response timing (first byte vs first text delta).
- **`citation.test.tsx`** — render component with multiple citations, with empty list.
- **`benchmark_smoke.test.ts`** — the benchmark's handler + mock model streams the full reply, with ordered timings.

## Docker

```bash
CHAT_ACCESS_KEY=... ANTHROPIC_API_KEY=... docker compose up app
# open http://localhost:3001
```

Multi-stage build, alpine base, runs as non-root `nextjs` user, ships only the `.next/standalone` output. Production image is small (~200 MB) and starts fast.

## Project layout

```
app/
  api/chat/route.ts        # wires the chat handler to Anthropic
  page.tsx                 # server component, mounts <Chat />
  layout.tsx
  globals.css

components/
  chat.tsx                 # useChat + composer + stop/regenerate
  message.tsx              # text + tool-invocation + citations
  citation.tsx             # footnote-style citation list

lib/
  chat-handler.ts          # access key, rate limit, size limits, streamText + tools
  tools.ts                 # calculator + search
  prompts.ts               # SYSTEM_PROMPT (cacheable)
  mock-provider.ts         # chunked stream + mock model + response timing

benchmarks/
  ttft_benchmark.ts        # 200-run TTFB through the chat handler
  results/
    ttft.json

tests/                     # 32 vitest tests
```

## What this is NOT

- A theme switcher (one mode: dark). Adding it is a 30-line PR.
- A persistence layer. Conversation history lives in the browser; on reload it is gone. Adding it is a `kv.set/get` call.
- A multi-user app. Single-user, single-conversation by design. Multi-user is the next iteration.

## License

MIT
