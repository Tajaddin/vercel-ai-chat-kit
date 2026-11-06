import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Chat } from "@/components/chat";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("Chat", () => {
  it("sends the access key as a bearer token", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response('0:"ok"\n', {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Chat />);
    fireEvent.change(screen.getByLabelText("Access key"), { target: { value: "s3cret" } });
    fireEvent.change(screen.getByLabelText("Message input"), { target: { value: "hi" } });
    fireEvent.submit(screen.getByRole("form", { name: "Send a message" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer s3cret");
    expect(sessionStorage.getItem("chat-access-key")).toBe("s3cret");
  });
});
