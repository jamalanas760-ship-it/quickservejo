import { TablesManagerPro } from "./TablesManagerPro";

export function TablesManagerModern({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="qs-tables-modern">
      <TablesManagerPro restaurantId={restaurantId} />
    </div>
  );
}
