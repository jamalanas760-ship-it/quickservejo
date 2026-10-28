/** Routes that continue the boot animation after the application hydrates. */
export const WORKSPACE_PATH =
  /^\/(dashboard|manage|shifts|profile|bookings|automations|operations|team|settings|tables|menu|orders|analytics|notifications|work|manager|kitchen|waiter|host|cashier|hq|devices|integrations|guests|campaigns|approvals|daily-close|super-admin)(\/|$)/;

export function isLaunchEntry(pathname: string): boolean {
  return pathname === "/" || pathname === "/auth" || WORKSPACE_PATH.test(pathname);
}
