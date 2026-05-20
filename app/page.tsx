import { Chat } from "@/components/chat";

export default function HomePage() {
  return (
    <main>
      <header>
        <h1>vercel-ai-chat-kit</h1>
        <p>
          Next.js 15 App Router + Vercel AI SDK. Streaming SSE, tool calls
          (calculator + search), citations, abort, regenerate.
        </p>
      </header>
      <Chat />
    </main>
  );
}
