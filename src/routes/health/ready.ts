import { createFileRoute } from "@tanstack/react-router";
import { databaseReady } from "@/lib/server/readiness.server";
export const Route = createFileRoute("/health/ready")({
  server: { handlers: { GET: async () => {
    const healthy = await databaseReady();
    return Response.json({ status: healthy ? "ready" : "unavailable" }, {
      status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" },
    });
  } } },
});
