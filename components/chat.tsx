"use client";

import { useChat } from "@ai-sdk/react";
import { Message } from "@/components/message";

export function Chat() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
    error,
  } = useChat({ api: "/api/chat" });

  return (
    <>
      <div className="chat" data-testid="chat">
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
      </div>

      {error ? (
        <div className="error" role="alert">
          {error.message}
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="row">
          {isLoading ? (
            <button type="button" onClick={stop} aria-label="Stop generating">
              stop
            </button>
          ) : (
            <button type="button" onClick={() => reload()} aria-label="Regenerate">
              regenerate
            </button>
          )}
        </div>
      ) : null}

      <div className="composer">
        <form onSubmit={handleSubmit} aria-label="Send a message">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask me anything..."
            aria-label="Message input"
            autoFocus
          />
          <button type="submit" disabled={isLoading || !input.trim()}>
            send
          </button>
        </form>
      </div>
    </>
  );
}
