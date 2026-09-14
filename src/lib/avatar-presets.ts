export type AvatarPreset = { id: string; label: string; url: string };

function svgAvatar(bg: string, skin: string, hair: string, shirt: string, accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="${bg}"/><circle cx="80" cy="66" r="31" fill="${skin}"/><path d="M48 63c2-29 16-43 34-43 22 0 34 17 34 41-9-12-19-18-34-18-12 0-23 6-34 20Z" fill="${hair}"/><path d="M27 154c5-39 24-58 53-58s48 19 53 58" fill="${shirt}"/><path d="M66 73c4 5 8 7 14 7s11-2 15-7" fill="none" stroke="${accent}" stroke-width="3.5" stroke-linecap="round"/><circle cx="69" cy="62" r="2.7" fill="#27272a"/><circle cx="92" cy="62" r="2.7" fill="#27272a"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "amber-01", label: "Amber", url: svgAvatar("#fff1e7", "#dca57e", "#2f211d", "#f97316", "#9a5f45") },
  { id: "slate-02", label: "Slate", url: svgAvatar("#eef2f7", "#c98f68", "#1f2937", "#334155", "#8c5740") },
  { id: "sage-03", label: "Sage", url: svgAvatar("#edf7f1", "#e1b18e", "#44342e", "#3f7d62", "#a96f53") },
  { id: "blue-04", label: "Blue", url: svgAvatar("#edf4ff", "#a96f50", "#151515", "#3267b1", "#714331") },
  { id: "rose-05", label: "Rose", url: svgAvatar("#fff0f4", "#d9a07b", "#4b2e32", "#b84f6b", "#915d46") },
  { id: "sand-06", label: "Sand", url: svgAvatar("#faf3e7", "#b97c59", "#28231f", "#8b6b45", "#714631") },
  { id: "violet-07", label: "Violet", url: svgAvatar("#f4efff", "#e6b899", "#3f314d", "#7657aa", "#aa7558") },
  { id: "teal-08", label: "Teal", url: svgAvatar("#eaf8f7", "#c58967", "#2b2420", "#257a76", "#845038") },
];

export function avatarPresetUrl(id: string | null | undefined) {
  return AVATAR_PRESETS.find((preset) => preset.id === id)?.url ?? null;
}
