import { Citations } from "@/components/citation";
import type { Message as ChatMessage } from "ai";

interface MessageProps {
  message: ChatMessage;
}

interface SearchToolResult {
  results?: Array<{ title: string; snippet: string }>;
}

export function Message({ message }: MessageProps) {
  const role = message.role;
  if (role === "user") {
    return (
      <div className="bubble user" data-testid={`msg-${message.id}`}>
        {message.content}
      </div>
    );
  }
  if (role === "system" || role === "data") {
    return null;
  }

  // Assistant message: may contain text and/or tool-invocation parts.
  const parts = message.parts ?? [];
  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");

  const toolInvocations = parts.filter((p) => p.type === "tool-invocation");
  const citations = collectCitations(toolInvocations);

  return (
    <div className="bubble assistant" data-testid={`msg-${message.id}`}>
      <div className="meta">assistant</div>
      {text ? <div>{renderWithCitations(text, citations)}</div> : null}
      {toolInvocations.map((p, i) =>
        p.type === "tool-invocation" ? (
          <div
            key={`${p.toolInvocation.toolCallId}-${i}`}
            className="bubble tool"
            data-testid={`tool-${p.toolInvocation.toolName}`}
          >
            <div className="meta">tool: {p.toolInvocation.toolName}</div>
            <code>{JSON.stringify(p.toolInvocation.args)}</code>
            {p.toolInvocation.state === "result" ? (
              <pre>{JSON.stringify(p.toolInvocation.result, null, 2)}</pre>
            ) : (
              <em>running...</em>
            )}
          </div>
        ) : null,
      )}
      {citations.length > 0 ? <Citations citations={citations} /> : null}
    </div>
  );
}

function collectCitations(toolParts: ReadonlyArray<unknown>): { title: string; snippet: string }[] {
  const out: { title: string; snippet: string }[] = [];
  for (const part of toolParts) {
    if (!part || typeof part !== "object") continue;
    const p = part as { type?: string; toolInvocation?: { toolName?: string; result?: SearchToolResult } };
    if (p.type !== "tool-invocation") continue;
    if (p.toolInvocation?.toolName !== "search") continue;
    const result = p.toolInvocation.result;
    if (result && Array.isArray(result.results)) {
      for (const hit of result.results) {
        out.push(hit);
      }
    }
  }
  return out;
}

function renderWithCitations(
  text: string,
  citations: { title: string; snippet: string }[],
): React.ReactNode {
  // The model is asked to cite via [title]; we replace each [title] with a
  // small footnote-style superscript that links to the citations panel.
  if (citations.length === 0) {
    return text;
  }
  const map = new Map<string, number>();
  citations.forEach((c, i) => map.set(c.title.toLowerCase(), i + 1));

  const pieces: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    pieces.push(text.slice(last, match.index));
    const idx = map.get(match[1]!.toLowerCase());
    if (idx !== undefined) {
      pieces.push(
        <a
          key={`cite-${match.index}`}
          className="citation"
          href={`#cite-${idx}`}
          aria-label={`citation ${idx}`}
        >
          {idx}
        </a>,
      );
    } else {
      pieces.push(match[0]);
    }
    last = match.index + match[0].length;
  }
  pieces.push(text.slice(last));
  return pieces;
}
