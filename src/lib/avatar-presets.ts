export type AvatarPreset = {
  id: string;
  label: string;
  role: string;
  url: string;
};

type AvatarStyle = {
  id: string;
  label: string;
  role: string;
  skin: string;
  hair: string;
  shirt: string;
  badge: string;
  background: string;
};

function avatarSvg(style: AvatarStyle) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${style.label}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.background}"/><stop offset="1" stop-color="#f8fafc"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".16"/></filter>
    </defs>
    <rect width="160" height="160" rx="34" fill="url(#bg)"/>
    <circle cx="80" cy="67" r="35" fill="${style.skin}" filter="url(#shadow)"/>
    <path d="M47 61c2-28 16-41 34-41 22 0 34 17 34 42-8-9-18-15-34-15-13 0-24 5-34 14Z" fill="${style.hair}"/>
    <circle cx="67" cy="68" r="3" fill="#27313a"/><circle cx="93" cy="68" r="3" fill="#27313a"/>
    <path d="M69 82c7 6 15 6 22 0" fill="none" stroke="#7b4f41" stroke-width="3" stroke-linecap="round"/>
    <path d="M31 153c3-34 22-52 49-52s47 18 50 52" fill="${style.shirt}" filter="url(#shadow)"/>
    <path d="M64 104l16 17 17-17" fill="#fff" opacity=".9"/>
    <circle cx="123" cy="124" r="24" fill="#fff" stroke="#e2e8f0" stroke-width="3"/>
    <text x="123" y="133" text-anchor="middle" font-size="25">${style.badge}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const STYLES: AvatarStyle[] = [
  { id: "role-manager", label: "Manager", role: "manager", skin: "#d9a07b", hair: "#2b211d", shirt: "#243b53", badge: "👔", background: "#dbeafe" },
  { id: "role-chef", label: "Chef", role: "chef", skin: "#efc3a2", hair: "#47352c", shirt: "#f8fafc", badge: "👨‍🍳", background: "#ffedd5" },
  { id: "role-waiter", label: "Waiter", role: "waiter", skin: "#c98d68", hair: "#171717", shirt: "#111827", badge: "🍽️", background: "#dcfce7" },
  { id: "role-cashier", label: "Cashier", role: "cashier", skin: "#e4aa84", hair: "#5b3624", shirt: "#7c3aed", badge: "💳", background: "#ede9fe" },
  { id: "role-purchasing", label: "Purchasing", role: "purchasing", skin: "#b97957", hair: "#292524", shirt: "#0f766e", badge: "🛒", background: "#ccfbf1" },
  { id: "role-inventory", label: "Inventory", role: "inventory", skin: "#f0bd98", hair: "#4b3621", shirt: "#475569", badge: "📦", background: "#e2e8f0" },
  { id: "role-kitchen", label: "Kitchen", role: "kitchen", skin: "#d79872", hair: "#332a26", shirt: "#b45309", badge: "🔥", background: "#fef3c7" },
  { id: "role-staff", label: "Staff", role: "staff", skin: "#e7b18d", hair: "#3f2d25", shirt: "#2563eb", badge: "⭐", background: "#dbeafe" },
];

export const AVATAR_PRESETS: AvatarPreset[] = STYLES.map((style) => ({
  id: style.id,
  label: style.label,
  role: style.role,
  url: avatarSvg(style),
}));

export function avatarPresetUrl(id: string | null | undefined) {
  return AVATAR_PRESETS.find((preset) => preset.id === id)?.url ?? null;
}
