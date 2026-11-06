"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useState } from "react";

import { Message } from "@/components/message";

// The API route requires the deployment's CHAT_ACCESS_KEY. It is kept for
// this browser tab only.
const ACCESS_KEY_STORAGE = "chat-access-key";

export function Chat() {
  const [accessKey, setAccessKey] = useState("");
  useEffect(() => {
    try {
      setAccessKey(sessionStorage.getItem(ACCESS_KEY_STORAGE) ?? "");
    } catch {
      // storage blocked: the key just isn't remembered
    }
  }, []);
  const headers = useMemo(
    () => (accessKey ? { Authorization: `Bearer ${accessKey}` } : undefined),
    [accessKey],
  );

  function onAccessKeyChange(value: string) {
    setAccessKey(value);
    try {
      sessionStorage.setItem(ACCESS_KEY_STORAGE, value);
    } catch {
      // storage blocked: the key just isn't remembered
    }
  }

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
    error,
  } = useChat({ api: "/api/chat", headers });

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
            className="access-key"
            type="password"
            value={accessKey}
            onChange={(e) => onAccessKeyChange(e.target.value)}
            placeholder="Access key"
            aria-label="Access key"
            autoComplete="off"
          />
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
