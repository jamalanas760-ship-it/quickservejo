import { BackOfficeShell } from "@/components/backoffice/BackOfficeShell";

/**
 * Kept as the stable entry point for the existing
 * /manage/:id/operations and /super-admin/restaurants/:id/operations routes.
 */
export function OperationsManager({ restaurantId }: { restaurantId: string }) {
  return <BackOfficeShell restaurantId={restaurantId} />;
}
