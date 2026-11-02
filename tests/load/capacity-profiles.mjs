// These are authenticated staging read-path profiles, not full workflow certification.
export function capacityProfile(mode) {
  const phase = (duration, target) => ({ duration, target });
  switch (mode) {
    case "smoke":
      return { executor: "constant-vus", vus: 2, duration: "1m" };
    case "target":
      return {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          phase("2m", 100),
          phase("5m", 250),
          phase("5m", 500),
          phase("5m", 1000),
          phase("60m", 1000),
          phase("2m", 0),
        ],
        gracefulRampDown: "30s",
      };
    case "load":
      return {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          phase("2m", 100),
          phase("3m", 500),
          phase("3m", 1000),
          phase("10m", 1000),
          phase("1m", 100),
          phase("3m", 100),
          phase("1m", 0),
        ],
        gracefulRampDown: "30s",
      };
    case "stress":
      return {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          phase("1m", 100),
          phase("2m", 500),
          phase("2m", 1000),
          phase("2m", 1500),
          phase("2m", 2000),
          phase("2m", 2000),
          phase("30s", 100),
          phase("3m", 100),
          phase("30s", 0),
        ],
        gracefulRampDown: "30s",
      };
    case "spike":
      return {
        executor: "ramping-vus",
        startVUs: 10,
        stages: [
          phase("1m", 10),
          phase("1s", 1000),
          phase("2m", 1000),
          phase("1s", 10),
          phase("3m", 10),
          phase("10s", 0),
        ],
        gracefulRampDown: "30s",
      };
    default:
      throw Error("Mode must be smoke, target, load, stress or spike");
  }
}
export function peakVirtualUsers(mode) {
  const profile = capacityProfile(mode);
  return profile.vus ?? Math.max(profile.startVUs, ...profile.stages.map((stage) => stage.target));
}
