export type NotificationPreferences = {
  newOrders: boolean;
  tableAlerts: boolean;
  system: boolean;
  marketing: boolean;
  sound: boolean;
  orderSounds: boolean;
  tableSounds: boolean;
  tone: "soft" | "classic" | "bell";
  volume: number;
};
export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  newOrders: true,
  tableAlerts: true,
  system: true,
  marketing: false,
  sound: true,
  orderSounds: true,
  tableSounds: false,
  tone: "soft",
  volume: 60,
};
export const notificationKey = (userId: string) => `quickserve.notifications:${userId}`;
export function normalizeNotificationPreferences(input: unknown): NotificationPreferences {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const next = { ...DEFAULT_NOTIFICATIONS };
  for (const key of [
    "newOrders",
    "tableAlerts",
    "system",
    "marketing",
    "sound",
    "orderSounds",
    "tableSounds",
  ] as const)
    if (typeof source[key] === "boolean") next[key] = source[key];
  if (source.tone === "soft" || source.tone === "classic" || source.tone === "bell")
    next.tone = source.tone;
  if (typeof source.volume === "number" && Number.isFinite(source.volume))
    next.volume = Math.max(0, Math.min(100, source.volume));
  return next;
}
export function readNotificationPreferences(userId: string | undefined): NotificationPreferences {
  if (typeof window === "undefined" || !userId) return { ...DEFAULT_NOTIFICATIONS };
  try {
    return normalizeNotificationPreferences(
      JSON.parse(localStorage.getItem(notificationKey(userId)) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_NOTIFICATIONS };
  }
}
