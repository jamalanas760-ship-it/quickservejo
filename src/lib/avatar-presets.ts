export type AvatarPreset = { id: string; label: string; url: string };

// Realistic portrait presets. User uploads always take priority over a preset.
export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "portrait-01", label: "Portrait 1", url: "https://randomuser.me/api/portraits/men/32.jpg" },
  { id: "portrait-02", label: "Portrait 2", url: "https://randomuser.me/api/portraits/women/44.jpg" },
  { id: "portrait-03", label: "Portrait 3", url: "https://randomuser.me/api/portraits/men/52.jpg" },
  { id: "portrait-04", label: "Portrait 4", url: "https://randomuser.me/api/portraits/women/65.jpg" },
  { id: "portrait-05", label: "Portrait 5", url: "https://randomuser.me/api/portraits/men/75.jpg" },
  { id: "portrait-06", label: "Portrait 6", url: "https://randomuser.me/api/portraits/women/68.jpg" },
  { id: "portrait-07", label: "Portrait 7", url: "https://randomuser.me/api/portraits/men/46.jpg" },
  { id: "portrait-08", label: "Portrait 8", url: "https://randomuser.me/api/portraits/women/47.jpg" },
];

export function avatarPresetUrl(id: string | null | undefined) {
  return AVATAR_PRESETS.find((preset) => preset.id === id)?.url ?? null;
}
