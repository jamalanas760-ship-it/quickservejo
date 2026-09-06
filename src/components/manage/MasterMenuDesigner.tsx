import { PdfMenuManager } from "./PdfMenuManager";

/** Compatibility entry point for older imports. The active restaurant menu workflow is PDF-first. */
export function MasterMenuDesigner({ restaurantId }: { restaurantId: string }) {
  return <PdfMenuManager restaurantId={restaurantId} />;
}
