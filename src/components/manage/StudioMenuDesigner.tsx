import { MenuDesigner } from "./MasterMenuDesigner";

export function StudioMenuDesigner({ restaurantId }: { restaurantId: string }) {
  return <MenuDesigner restaurantId={restaurantId} />;
}
