import { createFileRoute } from "@tanstack/react-router";
import { OperationsManager } from "@/components/manage/OperationsManager";
export const Route = createFileRoute("/_authenticated/manage/$restaurantId/operations")({ component: Page });
function Page() { const { restaurantId } = Route.useParams(); return <OperationsManager restaurantId={restaurantId} />; }
