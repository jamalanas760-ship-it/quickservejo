export const ALERT_TONES = [
  { id: "soft", en: "Soft chime", ar: "نغمة ناعمة" },
  { id: "classic", en: "Classic chime", ar: "نغمة كلاسيكية" },
  { id: "bell", en: "Bell", ar: "جرس" },
  { id: "glass", en: "Glass", ar: "زجاج" },
  { id: "marimba", en: "Marimba", ar: "ماريمبا" },
  { id: "gentle", en: "Gentle pulse", ar: "نبض هادئ" },
  { id: "bright", en: "Bright trio", ar: "ثلاثية مشرقة" },
  { id: "service", en: "Service bell", ar: "جرس الخدمة" },
] as const;
export type NotificationPreferences = {
  newOrders: boolean;
  tableAlerts: boolean;
  system: boolean;
  marketing: boolean;
  sound: boolean;
  orderSounds: boolean;
  tableSounds: boolean;
  tone: (typeof ALERT_TONES)[number]["id"];
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
  const tone = ALERT_TONES.find(item => item.id === source.tone);
  if (tone) next.tone = tone.id;
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
