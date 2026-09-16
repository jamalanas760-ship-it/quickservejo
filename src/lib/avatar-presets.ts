export type AvatarPreset = { id: string; label: string; role: string; url: string };

type AvatarStyle = {
  id: string;
  label: string;
  role: string;
  gender: "male" | "female";
  skin: string;
  skinShadow: string;
  hair: string;
  hairLight: string;
  uniform: string;
  uniformDark: string;
  background: string;
  background2: string;
  hat?: "chef" | "cap" | "none";
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char] ?? char);
}

function roleMark(role: string) {
  if (role === "owner") return `<path d="M119 116l3.2 6.4 7.1 1-5.1 5 1.2 7-6.4-3.3-6.3 3.3 1.2-7-5.2-5 7.2-1z" fill="#ffb347"/>`;
  if (role === "manager") return `<path d="M115 119h8v4h-8zM113 125h12v10h-12z" fill="#3457d5"/><path d="M117 125v10M121 125v10" stroke="#fff" stroke-width="1.5"/>`;
  if (role === "chef") return `<path d="M112 126h14M115 118v17M123 118v17" stroke="#ef4444" stroke-width="2.6" stroke-linecap="round"/><path d="M111 121h16" stroke="#ef4444" stroke-width="2.6" stroke-linecap="round"/>`;
  if (role === "waiter") return `<path d="M109 130h20M119 117v13" stroke="#111827" stroke-width="2.7" stroke-linecap="round"/><path d="M113 124c1-5 11-5 12 0" fill="none" stroke="#111827" stroke-width="2.7"/>`;
  if (role === "cashier") return `<rect x="110" y="118" width="18" height="14" rx="3" fill="#7c3aed"/><path d="M113 122h12M114 127h4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
  if (role === "inventory") return `<path d="M111 120l8-4 8 4-8 4zM111 120v9l8 4 8-4v-9M119 124v9" fill="none" stroke="#475569" stroke-width="2.2" stroke-linejoin="round"/>`;
  if (role === "purchasing") return `<rect x="112" y="117" width="14" height="18" rx="2.5" fill="#0f766e"/><path d="M116 115h6v4h-6z" fill="#0f766e"/><path d="M115 123h8M115 127h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;
  if (role === "kitchen") return `<path d="M112 119l14 14M126 119l-14 14" stroke="#b45309" stroke-width="2.8" stroke-linecap="round"/><circle cx="113" cy="120" r="2" fill="#b45309"/><circle cx="125" cy="120" r="2" fill="#b45309"/>`;
  return `<circle cx="119" cy="124" r="5" fill="#2563eb"/><path d="M110 135c1-5 4-8 9-8s8 3 9 8" fill="#2563eb"/>`;
}

function hair(style: AvatarStyle) {
  if (style.gender === "female") {
    return `<path d="M44 70c0-34 16-54 39-54 25 0 42 21 42 55 0 25-8 44-19 55l-12-11c8-10 13-26 12-44-1-23-8-36-24-36-15 0-23 13-24 36-1 18 4 34 13 45l-13 11C49 115 44 95 44 70Z" fill="url(#hair)"/>
      <path d="M52 50c10-24 29-31 47-19 7 5 12 12 15 21-17-10-42-12-62-2Z" fill="${style.hair}" opacity=".92"/>`;
  }
  return `<path d="M49 56c3-29 17-43 35-43 23 0 37 17 38 45-12-11-24-16-39-16-13 0-25 5-34 14Z" fill="url(#hair)"/>
    <path d="M55 43c9-17 25-23 42-17 9 3 16 9 20 18-22-8-43-8-62-1Z" fill="${style.hairLight}" opacity=".72"/>`;
}

function headwear(style: AvatarStyle) {
  if (style.hat === "chef") {
    return `<path d="M48 35c0-12 9-21 21-19 5-11 22-13 29-2 12-3 22 5 22 17 0 6-3 10-7 13H54c-4-2-6-5-6-9Z" fill="#fff" stroke="#d9dee8" stroke-width="2"/>
      <path d="M55 41h58v13H55z" fill="#fff" stroke="#d9dee8" stroke-width="2"/>`;
  }
  if (style.hat === "cap") {
    return `<path d="M49 44c5-19 20-29 36-29 17 0 30 10 35 29H49Z" fill="${style.uniform}"/><path d="M81 42h45c-4 7-14 11-27 11H81Z" fill="${style.uniformDark}"/>`;
  }
  return "";
}

function avatarSvg(style: AvatarStyle) {
  const face = `<ellipse cx="84" cy="73" rx="34" ry="39" fill="url(#skin)" filter="url(#portraitShadow)"/>
    <ellipse cx="51" cy="76" rx="6" ry="10" fill="${style.skinShadow}" opacity=".58"/><ellipse cx="117" cy="76" rx="6" ry="10" fill="${style.skinShadow}" opacity=".58"/>
    <path d="M69 67c4-3 8-3 12 0M91 67c4-3 8-3 12 0" fill="none" stroke="${style.hair}" stroke-width="2.3" stroke-linecap="round" opacity=".76"/>
    <ellipse cx="75" cy="75" rx="5" ry="6" fill="#fff"/><ellipse cx="97" cy="75" rx="5" ry="6" fill="#fff"/>
    <circle cx="75" cy="76" r="3.2" fill="#4a352d"/><circle cx="97" cy="76" r="3.2" fill="#4a352d"/><circle cx="76" cy="74.7" r="1" fill="#fff"/><circle cx="98" cy="74.7" r="1" fill="#fff"/>
    <path d="M86 77c-2 6-2 10 2 12" fill="none" stroke="#a96655" stroke-width="2" stroke-linecap="round"/>
    <path d="M73 94c8 7 19 7 27-1" fill="none" stroke="#9f4f4d" stroke-width="2.7" stroke-linecap="round"/>
    <ellipse cx="65" cy="88" rx="6" ry="3" fill="#e68d83" opacity=".18"/><ellipse cx="107" cy="88" rx="6" ry="3" fill="#e68d83" opacity=".18"/>`;

  const body = `<path d="M30 160c4-37 23-58 54-58s51 21 55 58H30Z" fill="url(#uniform)" filter="url(#portraitShadow)"/>
    <path d="M63 107l21 20 22-20-8-8c-8 6-20 7-29 0l-6 8Z" fill="#fff" opacity=".94"/>
    <path d="M84 127v33" stroke="#fff" stroke-opacity=".38" stroke-width="2"/>
    <path d="M67 111l17 16-9 7-18-20zM101 111l-17 16 9 7 18-20z" fill="#fff" opacity=".16"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${escapeXml(style.label)}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.background}"/><stop offset="1" stop-color="${style.background2}"/></linearGradient>
      <radialGradient id="glow" cx="50%" cy="18%" r="78%"><stop stop-color="#fff" stop-opacity=".78"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.skin}"/><stop offset="1" stop-color="${style.skinShadow}"/></linearGradient>
      <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.hairLight}"/><stop offset="1" stop-color="${style.hair}"/></linearGradient>
      <linearGradient id="uniform" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${style.uniform}"/><stop offset="1" stop-color="${style.uniformDark}"/></linearGradient>
      <filter id="portraitShadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0f172a" flood-opacity=".14"/></filter>
    </defs>
    <rect width="160" height="160" rx="32" fill="url(#bg)"/>
    <circle cx="80" cy="45" r="80" fill="url(#glow)"/>
    <circle cx="134" cy="26" r="28" fill="#fff" opacity=".16"/>
    ${hair(style)}
    ${face}
    ${headwear(style)}
    ${body}
    <circle cx="121" cy="126" r="21" fill="#fff" fill-opacity=".95" stroke="#e5e7eb" stroke-width="2.5" filter="url(#portraitShadow)"/>
    ${roleMark(style.role)}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const STYLES: AvatarStyle[] = [
  { id: "owner-male", label: "Owner · Male", role: "owner", gender: "male", skin: "#dfaa83", skinShadow: "#c98564", hair: "#211915", hairLight: "#4c352a", uniform: "#253247", uniformDark: "#111827", background: "#fff0e6", background2: "#f4e8ff", hat: "none" },
  { id: "owner-female", label: "Owner · Female", role: "owner", gender: "female", skin: "#dca37d", skinShadow: "#c48061", hair: "#352019", hairLight: "#634133", uniform: "#27364a", uniformDark: "#141f30", background: "#fff0e6", background2: "#f7ecff", hat: "none" },
  { id: "manager-male", label: "Manager · Male", role: "manager", gender: "male", skin: "#cf916d", skinShadow: "#b97558", hair: "#241b18", hairLight: "#5b4033", uniform: "#48627e", uniformDark: "#22354a", background: "#e8f1ff", background2: "#f4f8ff", hat: "none" },
  { id: "manager-female", label: "Manager · Female", role: "manager", gender: "female", skin: "#edbc96", skinShadow: "#d99b77", hair: "#40271e", hairLight: "#74503f", uniform: "#48627e", uniformDark: "#22354a", background: "#e8f1ff", background2: "#f6f8ff", hat: "none" },
  { id: "chef-male", label: "Chef · Male", role: "chef", gender: "male", skin: "#e6b18a", skinShadow: "#cc8d6d", hair: "#2e221d", hairLight: "#5c4034", uniform: "#f8fafc", uniformDark: "#cbd5e1", background: "#fff4e4", background2: "#fffaf2", hat: "chef" },
  { id: "chef-female", label: "Chef · Female", role: "chef", gender: "female", skin: "#c98665", skinShadow: "#a96950", hair: "#241b18", hairLight: "#5b3a2e", uniform: "#f8fafc", uniformDark: "#cbd5e1", background: "#fff4e4", background2: "#fffaf2", hat: "chef" },
  { id: "waiter-male", label: "Waiter · Male", role: "waiter", gender: "male", skin: "#d99e79", skinShadow: "#be795c", hair: "#171412", hairLight: "#45342b", uniform: "#222a35", uniformDark: "#080b10", background: "#e9f8f0", background2: "#f6fbf8", hat: "none" },
  { id: "waiter-female", label: "Waiter · Female", role: "waiter", gender: "female", skin: "#efc09c", skinShadow: "#d79a76", hair: "#33231d", hairLight: "#654438", uniform: "#222a35", uniformDark: "#080b10", background: "#e9f8f0", background2: "#f6fbf8", hat: "none" },
  { id: "cashier-male", label: "Cashier · Male", role: "cashier", gender: "male", skin: "#c98969", skinShadow: "#ac6d52", hair: "#2b1f1a", hairLight: "#604137", uniform: "#8157d6", uniformDark: "#4b269d", background: "#f1ebff", background2: "#faf7ff", hat: "none" },
  { id: "cashier-female", label: "Cashier · Female", role: "cashier", gender: "female", skin: "#dda681", skinShadow: "#c18262", hair: "#472b22", hairLight: "#744a3a", uniform: "#8157d6", uniformDark: "#4b269d", background: "#f1ebff", background2: "#faf7ff", hat: "none" },
  { id: "inventory-male", label: "Inventory · Male", role: "inventory", gender: "male", skin: "#e0ab85", skinShadow: "#c88b68", hair: "#3e2b22", hairLight: "#725244", uniform: "#667585", uniformDark: "#384652", background: "#edf2f7", background2: "#fbfcfd", hat: "cap" },
  { id: "inventory-female", label: "Inventory · Female", role: "inventory", gender: "female", skin: "#c88a69", skinShadow: "#a96c50", hair: "#271d19", hairLight: "#584036", uniform: "#667585", uniformDark: "#384652", background: "#edf2f7", background2: "#fbfcfd", hat: "cap" },
  { id: "purchasing-male", label: "Purchasing · Male", role: "purchasing", gender: "male", skin: "#bc7d5e", skinShadow: "#9f6249", hair: "#211916", hairLight: "#4f382e", uniform: "#169184", uniformDark: "#0b5f58", background: "#e3faf6", background2: "#f4fffd", hat: "none" },
  { id: "purchasing-female", label: "Purchasing · Female", role: "purchasing", gender: "female", skin: "#e8b28c", skinShadow: "#cd8e6c", hair: "#543226", hairLight: "#7a503e", uniform: "#169184", uniformDark: "#0b5f58", background: "#e3faf6", background2: "#f4fffd", hat: "none" },
  { id: "kitchen-male", label: "Kitchen · Male", role: "kitchen", gender: "male", skin: "#d59671", skinShadow: "#bb7558", hair: "#2c211c", hairLight: "#5e4236", uniform: "#d26b12", uniformDark: "#913f08", background: "#fff3d8", background2: "#fffaf0", hat: "cap" },
  { id: "kitchen-female", label: "Kitchen · Female", role: "kitchen", gender: "female", skin: "#dca37d", skinShadow: "#c18060", hair: "#35241f", hairLight: "#674639", uniform: "#d26b12", uniformDark: "#913f08", background: "#fff3d8", background2: "#fffaf0", hat: "cap" },
  { id: "staff-male", label: "Staff · Male", role: "staff", gender: "male", skin: "#e4ad87", skinShadow: "#cb8967", hair: "#32231d", hairLight: "#65483a", uniform: "#3f7ceb", uniformDark: "#174db5", background: "#eaf2ff", background2: "#f8fbff", hat: "none" },
  { id: "staff-female", label: "Staff · Female", role: "staff", gender: "female", skin: "#ca8b6a", skinShadow: "#ad6e51", hair: "#261c18", hairLight: "#594034", uniform: "#3f7ceb", uniformDark: "#174db5", background: "#eaf2ff", background2: "#f8fbff", hat: "none" },
];

export const AVATAR_PRESETS: AvatarPreset[] = STYLES.map((style) => ({
  id: style.id,
  label: style.label,
  role: style.role,
  url: avatarSvg(style),
}));

const LEGACY: Record<string, string> = {
  "role-manager": "manager-male",
  "role-chef": "chef-male",
  "role-waiter": "waiter-male",
  "role-cashier": "cashier-female",
  "role-purchasing": "purchasing-female",
  "role-inventory": "inventory-male",
  "role-kitchen": "kitchen-male",
  "role-staff": "staff-male",
};

export function avatarPresetUrl(id: string | null | undefined) {
  const resolved = id ? LEGACY[id] ?? id : null;
  return AVATAR_PRESETS.find((preset) => preset.id === resolved)?.url ?? null;
}
