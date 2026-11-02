// Isolated production-build SSR harness. No authenticated requests or outbound services.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
const root = new URL("../../.output/server/index.mjs", import.meta.url);
const app = (await import(pathToFileURL(root.pathname).href)).default;
globalThis.fetch = async () => {
  throw Error("Outbound services are blocked in the local public-render harness");
};
const server = createServer(async (req, res) => {
  if (req.method !== "GET" || req.url !== "/auth") {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const response = await app.fetch(
      new Request("http://localhost/auth"),
      {},
      {
        waitUntil(p) {
          Promise.resolve(p).catch(() => {});
        },
      },
    );
    res.writeHead(response.status, { "content-type": "text/html; charset=utf-8" });
    res.end(await response.text());
  } catch {
    res.writeHead(500);
    res.end("Local render failed");
  }
});
server.listen(41839, "127.0.0.1", () =>
  console.log("Isolated QuickServe production-build /auth harness ready on 127.0.0.1:41839"),
);
