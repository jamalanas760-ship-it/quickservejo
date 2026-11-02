// Local public SSR exercise only. This is not restaurant/user/database capacity evidence.
import http from "node:http";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
const base = new URL(process.env.LOCAL_TEST_URL || "http://127.0.0.1:41839/auth");
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.pathname !== "/auth"
)
  throw Error("This harness only targets the local public /auth route");
const profiles = {
  load: [
    [10, 5],
    [100, 8],
    [250, 8],
    [500, 8],
    [1000, 10],
    [10, 5],
  ],
  stress: [
    [500, 8],
    [1000, 8],
    [2000, 10],
    [10, 5],
  ],
  spike: [
    [10, 5],
    [1000, 10],
    [10, 5],
  ],
};
const agent = new http.Agent({ keepAlive: true, maxSockets: 2200 });
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
const quantile = (values, p) =>
  values.length ? values[Math.max(0, Math.ceil(values.length * p) - 1)] : null;
function request() {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.get(base, { agent }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () =>
        resolve({
          ms: performance.now() - start,
          ok: res.statusCode === 200 && text.includes("QuickServe sign in"),
          status: res.statusCode,
        }),
      );
    });
    req.setTimeout(5000, () => req.destroy(Error("timeout")));
    req.on("error", (e) =>
      resolve({
        ms: performance.now() - start,
        ok: false,
        status: e.message === "timeout" ? "timeout" : "transport",
      }),
    );
  });
}
const preflight = await request();
if (!preflight.ok) throw Error("Local render preflight failed: " + JSON.stringify(preflight));
const results = [];
for (const [profile, phases] of Object.entries(profiles)) {
  for (const [users, seconds] of phases) {
    const times = [],
      statuses = {};
    let failures = 0,
      inflight = 0,
      peakInflight = 0;
    const start = performance.now(),
      end = start + seconds * 1000;
    lag.reset();
    await Promise.all(
      Array.from({ length: users }, async () => {
        while (performance.now() < end) {
          inflight++;
          peakInflight = Math.max(peakInflight, inflight);
          const r = await request();
          inflight--;
          times.push(r.ms);
          statuses[r.status] = (statuses[r.status] || 0) + 1;
          if (!r.ok) failures++;
          await sleep(1000);
        }
      }),
    );
    times.sort((a, b) => a - b);
    const elapsed = (performance.now() - start) / 1000;
    const result = {
      profile,
      virtualUsers: users,
      scheduledSeconds: seconds,
      elapsedSeconds: +elapsed.toFixed(2),
      requests: times.length,
      failures,
      errorRate: failures / times.length,
      p50: quantile(times, 0.5),
      p95: quantile(times, 0.95),
      p99: quantile(times, 0.99),
      max: times.at(-1),
      throughput: times.length / elapsed,
      peakInflight,
      statuses,
      generatorLagP99Ms: lag.percentile(99) / 1e6,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
lag.disable();
agent.destroy();
await writeFile(
  new URL("./local-results.private.json", import.meta.url),
  JSON.stringify(
    {
      scope:
        "Local production-build public /auth SSR only; external fetch blocked; closed-loop users, 1 second think time. Excludes auth, DB, writes, realtime, real browsers and hosting.",
      results,
    },
    null,
    2,
  ),
);
process.exit(0);
