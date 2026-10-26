import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/health/live")({
  server: { handlers: { GET: () => Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }) } },
});
