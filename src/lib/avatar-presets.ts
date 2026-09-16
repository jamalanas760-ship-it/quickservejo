import ownerMale from "@/assets/avatar-01.jpg";
import ownerFemale from "@/assets/avatar-02.jpg";
import managerMale from "@/assets/avatar-03.jpg";
import managerFemale from "@/assets/avatar-04.jpg";
import chefMale from "@/assets/avatar-05.jpg";
import chefFemale from "@/assets/avatar-06.jpg";
import waiterMale from "@/assets/avatar-07.jpg";
import waiterFemale from "@/assets/avatar-08.jpg";
import cashierMale from "@/assets/avatar-09.jpg";
import cashierFemale from "@/assets/avatar-10.jpg";
import inventoryMale from "@/assets/avatar-11.jpg";
import inventoryFemale from "@/assets/avatar-12.jpg";
import purchasingMale from "@/assets/avatar-13.jpg";
import purchasingFemale from "@/assets/avatar-14.jpg";
import kitchenMale from "@/assets/avatar-15.jpg";
import kitchenFemale from "@/assets/avatar-16.jpg";
import staffMale from "@/assets/avatar-17.jpg";
import staffFemale from "@/assets/avatar-18.jpg";

export type AvatarPreset = { id: string; label: string; role: string; url: string };

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "owner-male", label: "Owner · Male", role: "owner", url: ownerMale },
  { id: "owner-female", label: "Owner · Female", role: "owner", url: ownerFemale },
  { id: "manager-male", label: "Manager · Male", role: "manager", url: managerMale },
  { id: "manager-female", label: "Manager · Female", role: "manager", url: managerFemale },
  { id: "chef-male", label: "Chef · Male", role: "chef", url: chefMale },
  { id: "chef-female", label: "Chef · Female", role: "chef", url: chefFemale },
  { id: "waiter-male", label: "Waiter · Male", role: "waiter", url: waiterMale },
  { id: "waiter-female", label: "Waiter · Female", role: "waiter", url: waiterFemale },
  { id: "cashier-male", label: "Cashier · Male", role: "cashier", url: cashierMale },
  { id: "cashier-female", label: "Cashier · Female", role: "cashier", url: cashierFemale },
  { id: "inventory-male", label: "Inventory · Male", role: "inventory", url: inventoryMale },
  { id: "inventory-female", label: "Inventory · Female", role: "inventory", url: inventoryFemale },
  { id: "purchasing-male", label: "Purchasing · Male", role: "purchasing", url: purchasingMale },
  { id: "purchasing-female", label: "Purchasing · Female", role: "purchasing", url: purchasingFemale },
  { id: "kitchen-male", label: "Kitchen · Male", role: "kitchen", url: kitchenMale },
  { id: "kitchen-female", label: "Kitchen · Female", role: "kitchen", url: kitchenFemale },
  { id: "staff-male", label: "Staff · Male", role: "staff", url: staffMale },
  { id: "staff-female", label: "Staff · Female", role: "staff", url: staffFemale },
];

const LEGACY: Record<string, string> = {
  "role-manager": managerMale,
  "role-chef": chefMale,
  "role-waiter": waiterMale,
  "role-cashier": cashierMale,
  "role-purchasing": purchasingMale,
  "role-inventory": inventoryMale,
  "role-kitchen": kitchenMale,
  "role-staff": staffMale,
};

export function avatarPresetUrl(id: string | null | undefined) {
  if (!id) return null;
  return AVATAR_PRESETS.find((preset) => preset.id === id)?.url ?? LEGACY[id] ?? null;
}