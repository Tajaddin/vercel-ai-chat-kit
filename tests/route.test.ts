// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/chat/route";

function post(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
}

describe("POST /api/chat", () => {
  const providerFetch = vi.fn(async () => new Response("{}", { status: 500 }));

  beforeEach(() => {
    providerFetch.mockClear();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubGlobal("fetch", providerFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses requests while CHAT_ACCESS_KEY is unset", async () => {
    vi.stubEnv("CHAT_ACCESS_KEY", "");
    const res = await POST(post());
    expect(res.status).toBe(503);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("does not call Anthropic for a request without the access key", async () => {
    vi.stubEnv("CHAT_ACCESS_KEY", "route-test-key");
    const res = await POST(post({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
