import { useRouterState } from "@tanstack/react-router";

/** A lightweight navigation signal that keeps the current page usable while the next route resolves. */
export function RouteProgress() {
  const pending = useRouterState({ select: (state) => state.status === "pending" });

  return (
    <div
      aria-hidden="true"
      data-active={pending}
      className="qs-route-progress fixed inset-x-0 top-0 z-[250] h-[3px] overflow-hidden"
    >
      <span className="block h-full w-full origin-left bg-[#e85d2a] shadow-[0_0_12px_rgba(232,93,42,.55)]" />
    </div>
  );
}
