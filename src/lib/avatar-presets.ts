export type AvatarPreset = {
  id: string;
  label: string;
  role: "owner" | "manager" | "operations" | "shift_manager" | "chef" | "cashier" | "server" | "kitchen" | "host" | "inventory" | "procurement" | "finance";
  gender: "male" | "female";
  url: string;
};

const portrait = (id: string) => `/avatars/${id}.webp`;

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "owner-male", label: "Owner · Male", role: "owner", gender: "male", url: portrait("owner-male") },
  { id: "owner-female", label: "Owner · Female", role: "owner", gender: "female", url: portrait("owner-female") },
  { id: "manager-male", label: "Manager · Male", role: "manager", gender: "male", url: portrait("manager-male") },
  { id: "manager-female", label: "Manager · Female", role: "manager", gender: "female", url: portrait("manager-female") },
  { id: "chef-male", label: "Chef · Male", role: "chef", gender: "male", url: portrait("chef-male") },
  { id: "chef-female", label: "Chef · Female", role: "chef", gender: "female", url: portrait("chef-female") },
  { id: "cashier-male", label: "Cashier · Male", role: "cashier", gender: "male", url: portrait("cashier-male") },
  { id: "cashier-female", label: "Cashier · Female", role: "cashier", gender: "female", url: portrait("cashier-female") },
  { id: "server-male", label: "Server · Male", role: "server", gender: "male", url: portrait("server-male") },
  { id: "server-female", label: "Server · Female", role: "server", gender: "female", url: portrait("server-female") },
  { id: "kitchen-male", label: "Kitchen · Male", role: "kitchen", gender: "male", url: portrait("kitchen-male") },
  { id: "kitchen-female", label: "Kitchen · Female", role: "kitchen", gender: "female", url: portrait("kitchen-female") },
  { id: "operations-male", label: "Operations Manager · Male", role: "operations", gender: "male", url: portrait("manager-male") },
  { id: "operations-female", label: "Operations Manager · Female", role: "operations", gender: "female", url: portrait("manager-female") },
  { id: "shift-manager-male", label: "Shift Manager · Male", role: "shift_manager", gender: "male", url: portrait("owner-male") },
  { id: "shift-manager-female", label: "Shift Manager · Female", role: "shift_manager", gender: "female", url: portrait("owner-female") },
  { id: "host-male", label: "Host · Male", role: "host", gender: "male", url: portrait("server-male") },
  { id: "host-female", label: "Host · Female", role: "host", gender: "female", url: portrait("server-female") },
  { id: "inventory-male", label: "Inventory · Male", role: "inventory", gender: "male", url: portrait("kitchen-male") },
  { id: "inventory-female", label: "Inventory · Female", role: "inventory", gender: "female", url: portrait("kitchen-female") },
  { id: "procurement-male", label: "Procurement · Male", role: "procurement", gender: "male", url: portrait("manager-male") },
  { id: "procurement-female", label: "Procurement · Female", role: "procurement", gender: "female", url: portrait("manager-female") },
  { id: "finance-male", label: "Finance · Male", role: "finance", gender: "male", url: portrait("cashier-male") },
  { id: "finance-female", label: "Finance · Female", role: "finance", gender: "female", url: portrait("cashier-female") },
];

const LEGACY: Record<string, string> = {
  "role-manager": "manager-male",
  "role-chef": "chef-male",
  "role-waiter": "server-male",
  "role-cashier": "cashier-female",
  "role-purchasing": "manager-female",
  "role-inventory": "kitchen-male",
  "role-kitchen": "kitchen-male",
  "role-staff": "server-male",
  "waiter-male": "server-male",
  "waiter-female": "server-female",
};

export function avatarPresetUrl(id: string | null | undefined) {
  const resolved = id ? LEGACY[id] ?? id : null;
  return AVATAR_PRESETS.find((preset) => preset.id === resolved)?.url ?? null;
}
