import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vercel-ai-chat-kit",
  description:
    "Production-shape Next.js 15 + Vercel AI SDK chat. Streaming SSE, tool calls, citations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
