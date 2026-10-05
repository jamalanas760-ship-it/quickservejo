export type AvatarPreset = {
  id: string;
  label: string;
  role: "owner" | "manager" | "operations" | "shift_manager" | "chef" | "cashier" | "server" | "kitchen" | "host" | "inventory" | "procurement" | "finance" | "hr";
  gender: "male" | "female";
  url: string;
};

// Lossless crops of the approved nine-portrait artwork. Supporting roles share artwork.
const portrait = (id: string) => `/avatars/flat-approved/${id}.png`;

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "owner-male", label: "Owner · Male", role: "owner", gender: "male", url: portrait("owner-male") },
  { id: "manager-female", label: "Manager · Female", role: "manager", gender: "female", url: portrait("manager-female") },
  { id: "hr-male", label: "HR · Male", role: "hr", gender: "male", url: portrait("hr-male") },
  { id: "chef-female", label: "Chef · Female", role: "chef", gender: "female", url: portrait("chef-female") },
  { id: "server-male", label: "Server · Male", role: "server", gender: "male", url: portrait("server-male") },
  { id: "cashier-female", label: "Cashier · Female", role: "cashier", gender: "female", url: portrait("cashier-female") },
  { id: "operations-male", label: "Operations Manager · Male", role: "operations", gender: "male", url: portrait("operations-male") },
  { id: "host-female", label: "Host · Female", role: "host", gender: "female", url: portrait("host-female") },
  { id: "kitchen-male", label: "Kitchen · Male", role: "kitchen", gender: "male", url: portrait("kitchen-male") },
  { id: "shift-manager-female", label: "Shift Manager · Female", role: "shift_manager", gender: "female", url: portrait("manager-female") },
  { id: "inventory-male", label: "Inventory · Male", role: "inventory", gender: "male", url: portrait("operations-male") },
  { id: "procurement-male", label: "Procurement · Male", role: "procurement", gender: "male", url: portrait("hr-male") },
  { id: "finance-male", label: "Finance · Male", role: "finance", gender: "male", url: portrait("hr-male") },
];

// Keep every previously saved preset readable without updating account records.
const LEGACY: Record<string, string> = {
  "role-manager": "manager-female",
  "role-chef": "chef-female",
  "role-waiter": "server-male",
  "role-cashier": "cashier-female",
  "role-purchasing": "procurement-male",
  "role-inventory": "inventory-male",
  "role-kitchen": "kitchen-male",
  "role-staff": "server-male",
  "waiter-male": "server-male",
  "waiter-female": "host-female",
  "manager-male": "owner-male",
  "chef-male": "kitchen-male",
  "cashier-male": "server-male",
  "server-male-2": "server-male",
  "host-male": "server-male",
  "manager-male-2": "owner-male",
  "shift-manager-male": "owner-male",
  "kitchen-male-2": "kitchen-male",
  "owner-female": "manager-female",
  "server-female": "host-female",
  "finance-female": "manager-female",
  "kitchen-female": "chef-female",
  "hr-female": "manager-female",
  "procurement-female": "manager-female",
  "manager-female-2": "manager-female",
  "server-female-2": "host-female",
  "inventory-female": "cashier-female",
  "operations-female": "manager-female",
  "owner-female-2": "manager-female",
};

export function resolveAvatarPresetId(id: string | null | undefined) {
  const resolved = id ? LEGACY[id] ?? id : null;
  return AVATAR_PRESETS.find((preset) => preset.id === resolved)?.id ?? null;
}

export function avatarPresetUrl(id: string | null | undefined) {
  const resolved = resolveAvatarPresetId(id);
  return AVATAR_PRESETS.find((preset) => preset.id === resolved)?.url ?? null;
}

const ROLE_PRESETS: Record<string, string> = {
  super_admin: "owner-male",
  restaurant_admin: "manager-female",
  owner: "owner-male",
  operations_manager: "operations-male",
  manager: "shift-manager-female",
  shift_manager: "shift-manager-female",
  chef: "chef-female",
  kitchen: "kitchen-male",
  waiter: "server-male",
  server: "server-male",
  cashier: "cashier-female",
  host: "host-female",
  inventory: "inventory-male",
  procurement: "procurement-male",
  accountant: "finance-male",
  finance: "finance-male",
  hr: "hr-male",
};

export function roleAvatarUrl(role: string | null | undefined) {
  return avatarPresetUrl(role ? ROLE_PRESETS[role] : null);
}
