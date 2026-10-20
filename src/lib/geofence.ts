export type PunchLocation = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  reason: string | null;
};
export type GeofenceVerification = {
  status: "on_premise" | "off_premise" | "unverified" | "not_configured";
  distance_meters: number | null;
  reason?: string | null;
};
export function validCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}
export function haversineMeters(lat: number, lon: number, targetLat: number, targetLon: number) {
  if (!validCoordinates(lat, lon) || !validCoordinates(targetLat, targetLon))
    throw new Error("Invalid coordinates");
  const rad = (n: number) => (n * Math.PI) / 180,
    a =
      Math.sin(rad(targetLat - lat) / 2) ** 2 +
      Math.cos(rad(lat)) * Math.cos(rad(targetLat)) * Math.sin(rad(targetLon - lon) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}
export function verifyGeofence(
  location: PunchLocation,
  restaurant: {
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius_meters?: number;
  },
): GeofenceVerification {
  if (restaurant.latitude == null || restaurant.longitude == null)
    return { status: "not_configured", distance_meters: null };
  if (location.latitude == null || location.longitude == null)
    return { status: "unverified", distance_meters: null, reason: location.reason };
  if (
    !validCoordinates(location.latitude, location.longitude) ||
    !validCoordinates(restaurant.latitude, restaurant.longitude)
  )
    return { status: "unverified", distance_meters: null, reason: "invalid" };
  const radius = restaurant.geofence_radius_meters ?? 100,
    distance = haversineMeters(
      location.latitude,
      location.longitude,
      restaurant.latitude,
      restaurant.longitude,
    );
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    location.accuracy == null ||
    !Number.isFinite(location.accuracy) ||
    location.accuracy < 0 ||
    location.accuracy > radius
  )
    return { status: "unverified", distance_meters: distance, reason: "inaccurate" };
  return { status: distance <= radius ? "on_premise" : "off_premise", distance_meters: distance };
}
export const ATTENDANCE_LOCATION_MAX_AGE_MS = 30000;
export function freshAttendanceFix(timestamp: number, now = Date.now()): boolean {
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now &&
    now - timestamp <= ATTENDANCE_LOCATION_MAX_AGE_MS
  );
}
/** Reuse only a very recent, accurate, on-premise watch fix at click time. */
export function recentPunchLocation(
  fix: { timestamp: number; location: PunchLocation } | null,
  restaurant: Parameters<typeof verifyGeofence>[1] | null | undefined,
  now = Date.now(),
): PunchLocation | null {
  return fix &&
    restaurant &&
    freshAttendanceFix(fix.timestamp, now) &&
    now - fix.timestamp <= 10000 &&
    verifyGeofence(fix.location, restaurant).status === "on_premise"
    ? { ...fix.location }
    : null;
}
export function capturePunchLocation(): Promise<PunchLocation> {
  const fallback = (reason: string) => ({
    latitude: null,
    longitude: null,
    accuracy: null,
    reason,
  });
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve(fallback("unavailable"));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: PunchLocation) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => finish(fallback("timeout")), 11000);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) =>
          finish(
            validCoordinates(p.coords.latitude, p.coords.longitude) &&
              freshAttendanceFix(p.timestamp) &&
              Date.now() - p.timestamp <= 10000
              ? {
                  latitude: p.coords.latitude,
                  longitude: p.coords.longitude,
                  accuracy: p.coords.accuracy,
                  reason: null,
                }
              : fallback("invalid"),
          ),
        (e) =>
          finish(
            fallback(e.code === 1 ? "permission_denied" : e.code === 3 ? "timeout" : "unavailable"),
          ),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
      );
    } catch {
      finish(fallback("unavailable"));
    }
  });
}
