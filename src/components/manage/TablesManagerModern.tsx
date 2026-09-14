import { TablesManager } from "./TablesManager";

export function TablesManagerModern({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="qs-tables-modern">
      <TablesManager restaurantId={restaurantId} />
    </div>
  );
}
