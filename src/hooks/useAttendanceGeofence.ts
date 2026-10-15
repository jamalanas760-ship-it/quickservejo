import { useEffect, useState } from "react";
import {
  freshAttendanceFix,
  verifyGeofence,
  type PunchLocation,
  type GeofenceVerification,
} from "@/lib/geofence";
type RestaurantFence = {
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number;
};
export function useAttendanceGeofence(
  key: string,
  restaurant: RestaurantFence | null | undefined,
  now: number,
) {
  const [retry, setRetry] = useState(0);
  const [fix, setFix] = useState<{
    key: string;
    timestamp: number;
    location: PunchLocation;
  } | null>(null);
  useEffect(() => {
    let active = true;
    let watch: number | undefined;
    let generation = 0;
    let permissionBlocked = false;
    const unavailable = (reason: string) => {
      if (active)
        setFix({
          key,
          timestamp: Date.now(),
          location: { latitude: null, longitude: null, accuracy: null, reason },
        });
    };
    const start = (reset = true) => {
      const ticket = ++generation;
      if (reset) {
        setFix(null);
        permissionBlocked = false;
      }
      if (!navigator.geolocation) {
        unavailable("unavailable");
        return;
      }
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      try {
        watch = navigator.geolocation.watchPosition(
          (p) => {
            if (active && ticket === generation)
              setFix({
                key,
                timestamp: p.timestamp,
                location: {
                  latitude: p.coords.latitude,
                  longitude: p.coords.longitude,
                  accuracy: p.coords.accuracy,
                  reason: null,
                },
              });
          },
          (e) => {
            if (!active || ticket !== generation) return;
            permissionBlocked = e.code === 1;
            unavailable(
              e.code === 1 ? "permission_denied" : e.code === 3 ? "timeout" : "unavailable",
            );
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
        );
      } catch {
        unavailable("unavailable");
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") start();
      else {
        generation++;
        if (watch !== undefined) navigator.geolocation.clearWatch(watch);
        setFix(null);
      }
    };
    const focus = () => start();
    start();
    // Periodic fresh fixes keep a stationary user enabled without accepting stale GPS.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !permissionBlocked) start(false);
    }, 20000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
    };
  }, [key, retry]);
  const verification: GeofenceVerification = !restaurant
    ? { status: "unverified", distance_meters: null, reason: "loading" }
    : !fix || fix.key !== key
      ? { status: "unverified", distance_meters: null, reason: "loading" }
      : !freshAttendanceFix(fix.timestamp, Math.max(now, Date.now()))
        ? { status: "unverified", distance_meters: null, reason: "stale" }
        : verifyGeofence(fix.location, restaurant);
  return {
    verification,
    eligible: verification.status === "on_premise",
    refresh: () => setRetry((value) => value + 1),
  };
}
