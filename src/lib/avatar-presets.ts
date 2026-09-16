export type AvatarPreset = {
  id: string;
  label: string;
  role: "owner" | "manager" | "chef" | "cashier" | "server" | "kitchen";
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
