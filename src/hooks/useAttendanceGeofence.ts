import { useEffect, useRef, useState } from "react";
import {
  freshAttendanceFix,
  recentPunchLocation,
  verifyGeofence,
  type GeofenceVerification,
} from "@/lib/geofence";
import {
  subscribeAttendanceLocation,
  type AttendanceLocationState,
} from "@/lib/attendance-location";

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
  const [state, setState] = useState<AttendanceLocationState & { key: string }>({
    key,
    phase: "checking",
    fix: null,
  });
  const session = useRef<ReturnType<typeof subscribeAttendanceLocation> | null>(null);
  useEffect(() => {
    const current = subscribeAttendanceLocation(key, (next) => setState({ ...next, key }), {
      navigator,
      document,
      window,
    });
    session.current = current;
    return () => {
      current.dispose();
      session.current = null;
    };
  }, [key]);
  const phase = state.key === key ? state.phase : "checking";
  const fix = state.key === key ? state.fix : null;
  const verification: GeofenceVerification = !restaurant
    ? { status: "unverified", distance_meters: null, reason: "loading" }
    : restaurant.latitude == null || restaurant.longitude == null
      ? { status: "not_configured", distance_meters: null }
      : !fix
        ? { status: "unverified", distance_meters: null, reason: phase }
        : !freshAttendanceFix(fix.timestamp, Math.max(now, Date.now()))
          ? { status: "unverified", distance_meters: null, reason: "stale" }
          : verifyGeofence(fix.location, restaurant);
  return {
    verification,
    phase,
    updatedAt: fix?.timestamp ?? null,
    eligible: verification.status === "on_premise",
    getPunchLocation: () => recentPunchLocation(fix, restaurant),
    refresh: () => session.current?.request(),
  };
}
