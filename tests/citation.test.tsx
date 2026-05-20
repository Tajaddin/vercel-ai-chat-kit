import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Citations } from "@/components/citation";

describe("Citations", () => {
  it("renders one entry per citation, anchored by index", () => {
    render(
      <Citations
        citations={[
          { title: "anthropic", snippet: "AI safety company" },
          { title: "vercel ai sdk", snippet: "TypeScript-first" },
        ]}
      />,
    );
    expect(screen.getByText("[1]")).toBeInTheDocument();
    expect(screen.getByText("[2]")).toBeInTheDocument();
    expect(screen.getByText(/AI safety company/)).toBeInTheDocument();
    expect(screen.getByText(/TypeScript-first/)).toBeInTheDocument();
  });

  it("renders nothing visible when given an empty list", () => {
    render(<Citations citations={[]} />);
    // The wrapper still exists for aria; just no list items.
    const wrapper = screen.getByLabelText("Citations");
    expect(wrapper.children.length).toBe(0);
  });
});
