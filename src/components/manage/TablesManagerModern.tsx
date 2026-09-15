import { TablesManagerApproved } from "./TablesManagerApproved";

export function TablesManagerModern({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="qs-tables-modern">
      <TablesManagerApproved restaurantId={restaurantId} />
    </div>
  );
}