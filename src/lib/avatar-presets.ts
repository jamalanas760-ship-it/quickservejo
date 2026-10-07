export type AvatarPreset = {
  id: string;
  label: string;
  role:
    | "owner"
    | "manager"
    | "operations"
    | "shift_manager"
    | "chef"
    | "cashier"
    | "server"
    | "kitchen"
    | "host"
    | "inventory"
    | "procurement"
    | "finance"
    | "hr";
  gender: "male" | "female";
  url: string;
};

// Independent crops of the approved male and female role artwork.
const portrait = (id: string) => `/avatars/flat-approved/${id}.png`;
export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: "owner-male",
    label: "Owner · Male",
    role: "owner",
    gender: "male",
    url: portrait("owner-male"),
  },
  {
    id: "owner-female",
    label: "Owner · Female",
    role: "owner",
    gender: "female",
    url: portrait("owner-female"),
  },
  {
    id: "manager-male",
    label: "Manager · Male",
    role: "manager",
    gender: "male",
    url: portrait("manager-male"),
  },
  {
    id: "manager-female",
    label: "Manager · Female",
    role: "manager",
    gender: "female",
    url: portrait("manager-female"),
  },
  {
    id: "operations-male",
    label: "Operations · Male",
    role: "operations",
    gender: "male",
    url: portrait("operations-male"),
  },
  {
    id: "operations-female",
    label: "Operations · Female",
    role: "operations",
    gender: "female",
    url: portrait("operations-female"),
  },
  {
    id: "shift-manager-male",
    label: "Shift Manager · Male",
    role: "shift_manager",
    gender: "male",
    url: portrait("shift-manager-male"),
  },
  {
    id: "shift-manager-female",
    label: "Shift Manager · Female",
    role: "shift_manager",
    gender: "female",
    url: portrait("shift-manager-female"),
  },
  {
    id: "chef-male",
    label: "Chef · Male",
    role: "chef",
    gender: "male",
    url: portrait("chef-male"),
  },
  {
    id: "chef-female",
    label: "Chef · Female",
    role: "chef",
    gender: "female",
    url: portrait("chef-female"),
  },
  {
    id: "cashier-male",
    label: "Cashier · Male",
    role: "cashier",
    gender: "male",
    url: portrait("cashier-male"),
  },
  {
    id: "cashier-female",
    label: "Cashier · Female",
    role: "cashier",
    gender: "female",
    url: portrait("cashier-female"),
  },
  {
    id: "server-male",
    label: "Server · Male",
    role: "server",
    gender: "male",
    url: portrait("server-male"),
  },
  {
    id: "server-female",
    label: "Server · Female",
    role: "server",
    gender: "female",
    url: portrait("server-female"),
  },
  {
    id: "kitchen-male",
    label: "Kitchen · Male",
    role: "kitchen",
    gender: "male",
    url: portrait("kitchen-male"),
  },
  {
    id: "kitchen-female",
    label: "Kitchen · Female",
    role: "kitchen",
    gender: "female",
    url: portrait("kitchen-female"),
  },
  {
    id: "host-male",
    label: "Host · Male",
    role: "host",
    gender: "male",
    url: portrait("host-male"),
  },
  {
    id: "host-female",
    label: "Host · Female",
    role: "host",
    gender: "female",
    url: portrait("host-female"),
  },
  {
    id: "inventory-male",
    label: "Inventory · Male",
    role: "inventory",
    gender: "male",
    url: portrait("inventory-male"),
  },
  {
    id: "inventory-female",
    label: "Inventory · Female",
    role: "inventory",
    gender: "female",
    url: portrait("inventory-female"),
  },
  {
    id: "procurement-male",
    label: "Procurement · Male",
    role: "procurement",
    gender: "male",
    url: portrait("procurement-male"),
  },
  {
    id: "procurement-female",
    label: "Procurement · Female",
    role: "procurement",
    gender: "female",
    url: portrait("procurement-female"),
  },
  {
    id: "finance-male",
    label: "Finance · Male",
    role: "finance",
    gender: "male",
    url: portrait("finance-male"),
  },
  {
    id: "finance-female",
    label: "Finance · Female",
    role: "finance",
    gender: "female",
    url: portrait("finance-female"),
  },
  { id: "hr-male", label: "Hr · Male", role: "hr", gender: "male", url: portrait("hr-male") },
  {
    id: "hr-female",
    label: "Hr · Female",
    role: "hr",
    gender: "female",
    url: portrait("hr-female"),
  },
  {
    id: "chef-2-male",
    label: "Chef 02 · Male",
    role: "chef",
    gender: "male",
    url: portrait("chef-2-male"),
  },
  {
    id: "chef-2-female",
    label: "Chef 02 · Female",
    role: "chef",
    gender: "female",
    url: portrait("chef-2-female"),
  },
  {
    id: "server-2-male",
    label: "Server 02 · Male",
    role: "server",
    gender: "male",
    url: portrait("server-2-male"),
  },
  {
    id: "server-2-female",
    label: "Server 02 · Female",
    role: "server",
    gender: "female",
    url: portrait("server-2-female"),
  },
  {
    id: "host-2-male",
    label: "Host 02 · Male",
    role: "host",
    gender: "male",
    url: portrait("host-2-male"),
  },
  {
    id: "host-2-female",
    label: "Host 02 · Female",
    role: "host",
    gender: "female",
    url: portrait("host-2-female"),
  },
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
  "waiter-female": "server-female",
  "manager-male": "owner-male",
  "chef-male": "kitchen-male",
  "cashier-male": "server-male",
  "server-male-2": "server-2-male",
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
  "server-female-2": "server-2-female",
  "inventory-female": "cashier-female",
  "operations-female": "manager-female",
  "owner-female-2": "manager-female",
};

export function resolveAvatarPresetId(id: string | null | undefined) {
  const resolved = id
    ? AVATAR_PRESETS.some((preset) => preset.id === id)
      ? id
      : (LEGACY[id] ?? id)
    : null;
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
