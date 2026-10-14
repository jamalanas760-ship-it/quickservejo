import express from "express";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.mjs";
import { AccessError, createVerifier } from "./auth.mjs";
import { createDatabase } from "./database.mjs";
import { assertProviderReady } from "./discovery.mjs";
import { tools, executeTool } from "./tools.mjs";

export function createApp(config, database, verify = createVerifier(config)) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (req.headers.host !== config.host) return res.status(400).json({ error: "invalid_host" });
    const origin = req.headers.origin;
    if (origin && ![config.origin, "https://quickservejo.lovable.app"].includes(origin))
      return res.status(403).json({ error: "invalid_origin" });
    if (origin)
      res.set({
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Expose-Headers": "WWW-Authenticate",
      });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  const metadata = {
    resource: config.publicUrl,
    authorization_servers: [config.issuer],
    scopes_supported: ["quickserve:read", "quickserve:write"],
    bearer_methods_supported: ["header"],
    resource_name: "QuickServe",
  };
  app.get(
    ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"],
    (_req, res) => res.json(metadata),
  );
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "quickserve-mcp-gateway", version: "0.1.0" }),
  );
  const budgets = new Map();
  app.all("/mcp", async (req, res, next) => {
    try {
      // Resource URL and discovery are pinned configuration, never reflected from a caller's Host.
      req.identity = await verify(req.headers.authorization);
      const now = Date.now();
      if (budgets.size >= 5000)
        for (const [key, value] of budgets) if (now - value.at >= 60000) budgets.delete(key);
      const budget = budgets.get(req.identity.subject);
      if (budget && now - budget.at < 60000 && budget.count >= 120) {
        res.set("Retry-After", "60");
        return res.status(429).json({ error: "rate_limited" });
      }
      if (!budget || now - budget.at >= 60000) {
        if (budgets.size >= 5000) return res.status(503).json({ error: "busy" });
        budgets.set(req.identity.subject, { at: now, count: 1 });
      } else budget.count++;
      if (req.method !== "POST") {
        res.set("Allow", "POST, OPTIONS");
        return res.sendStatus(405);
      }
      next();
    } catch (error) {
      const status = error instanceof AccessError ? error.status : 401;
      if (status === 401)
        res.set(
          "WWW-Authenticate",
          `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/mcp", scope="quickserve:read", error="invalid_token"`,
        );
      if (status === 403 && error.code === "insufficient_scope")
        res.set("WWW-Authenticate", 'Bearer error="insufficient_scope", scope="quickserve:read"');
      return res
        .status(status)
        .json({ error: error instanceof AccessError ? error.code : "invalid_token" });
    }
  });
  app.post("/mcp", express.json({ limit: "64kb" }), async (req, res) => {
    const identity = req.identity;
    const server = new McpServer(
      { name: "quickserve", version: "0.1.0" },
      {
        instructions:
          "Access QuickServe using your linked account and existing restaurant permissions. Start with list_restaurants. Obtain explicit approval before creating reservations or changing orders/menu items.",
      },
    );
    for (const tool of tools) {
      if (tool.write && !identity.scopes.has("quickserve:write")) continue;
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.schema,
          annotations: {
            readOnlyHint: !tool.write,
            destructiveHint: tool.name === "update_order_status",
            idempotentHint: tool.name !== "create_reservation",
            openWorldHint: false,
          },
        },
        async (args) => {
          try {
            const result = await executeTool(tool, args, identity, database);
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
              structuredContent: result,
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    error instanceof AccessError
                      ? error.code
                      : error?.code === "42501"
                        ? "access_denied"
                        : "Request failed. Check your permissions, inputs and availability.",
                },
              ],
            };
          }
        },
      );
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: "service_unavailable" });
    }
  });
  app.use((_error, _req, res, _next) => {
    if (!res.headersSent) res.status(400).json({ error: "invalid_request" });
  });
  return app;
}
async function start() {
  const config = loadConfig();
  await assertProviderReady(config);
  const database = createDatabase(config);
  await database.assertRole();
  const listener = createApp(config, database).listen(config.port, "0.0.0.0", () =>
    console.info("QuickServe MCP gateway started"),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      listener.close();
      void database.close().finally(() => process.exit(0));
    });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  start().catch(() => {
    console.error(
      "Gateway startup failed: check OAuth and least-privilege database configuration.",
    );
    process.exit(1);
  });
