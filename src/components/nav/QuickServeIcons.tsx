import { createLucideIcon } from "lucide-react";

// One outline family for navigation and matching page icons.
export const Home = createLucideIcon("QuickServeHome", [
  ["path", { d: "M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z", key: "house" }],
]);
export const Users = createLucideIcon("QuickServeTeam", [
  ["circle", { cx: "9", cy: "7", r: "3", key: "person" }],
  [
    "path",
    { d: "M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M19 13a5 5 0 0 1 3 5v3", key: "group" },
  ],
]);
export const UtensilsCrossed = createLucideIcon("QuickServeMenu", [
  [
    "path",
    { d: "M4 10a8 8 0 0 1 16 0M3 10h18M4 14h16M3 18h18M5 21h14M9 6h.01M15 6h.01", key: "menu" },
  ],
]);
export const Table2 = createLucideIcon("QuickServeTables", [
  ["path", { d: "M5 7h14v4H5zM7 11v10M17 11v10M2 4v11h3M2 15v6M22 4v11h-3M22 15v6", key: "table" }],
]);
export const MoreHorizontal = createLucideIcon("QuickServeMore", [
  ["circle", { cx: "4", cy: "12", r: "1.6", fill: "currentColor", strokeWidth: "0", key: "left" }],
  [
    "circle",
    { cx: "12", cy: "12", r: "1.6", fill: "currentColor", strokeWidth: "0", key: "middle" },
  ],
  [
    "circle",
    { cx: "20", cy: "12", r: "1.6", fill: "currentColor", strokeWidth: "0", key: "right" },
  ],
]);

export const QuickServeWork = createLucideIcon("QuickServeWork", [
  ["path", { d: "M4 5h16v14H4zM8 3v4M16 3v4M7 11h10M7 15h6", key: "work" }],
]);
export const QuickServeWorkforce = createLucideIcon("QuickServeWorkforce", [
  ["path", { d: "M4 5h16v15H4zM8 3v4M16 3v4M7 12h10M7 16h6", key: "workforce" }],
]);
export const QuickServeAutomation = createLucideIcon("QuickServeAutomation", [
  ["circle", { cx: "6", cy: "6", r: "2", key: "a" }],
  ["circle", { cx: "18", cy: "18", r: "2", key: "b" }],
  ["path", { d: "M8 6h5a5 5 0 0 1 5 5v5", key: "flow" }],
]);
export const QuickServeOrders = createLucideIcon("QuickServeOrders", [
  ["path", { d: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h4", key: "orders" }],
]);
export const QuickServeReservations = createLucideIcon("QuickServeReservations", [
  ["path", { d: "M4 5h16v15H4zM8 3v4M16 3v4M7 10h10M7 14h4", key: "reservations" }],
  ["circle", { cx: "16", cy: "16", r: "3", key: "clock" }],
]);
export const QuickServeWaitlist = createLucideIcon("QuickServeWaitlist", [
  ["circle", { cx: "12", cy: "12", r: "8", key: "wait" }],
  ["path", { d: "M12 8v5l3 2", key: "time" }],
]);
export const QuickServeErp = createLucideIcon("QuickServeErp", [
  ["path", { d: "m12 3 7 4v8l-7 4-7-4V7zM5 7l7 4 7-4M12 11v8", key: "erp" }],
]);
export const QuickServeAnalytics = createLucideIcon("QuickServeAnalytics", [
  ["path", { d: "M5 20V10M12 20V4M19 20v-7M3 20h18", key: "analytics" }],
]);
export const QuickServeDailyClose = createLucideIcon("QuickServeDailyClose", [
  ["path", { d: "M6 3h12v18H6zM9 8h6M9 12h6M9 16l2 2 4-4", key: "close" }],
]);
export const QuickServeGuests = createLucideIcon("QuickServeGuests", [
  ["circle", { cx: "9", cy: "8", r: "3", key: "guest" }],
  [
    "path",
    { d: "M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2", key: "guests" },
  ],
]);
export const QuickServeCampaigns = createLucideIcon("QuickServeCampaigns", [
  ["path", { d: "m4 12 10-5v10L4 12zM14 10h4a3 3 0 0 1 0 6h-4M6 14l1 5", key: "campaign" }],
]);
export const QuickServeConnect = createLucideIcon("QuickServeConnect", [
  ["path", { d: "M9 15 15 9M7 17H5a3 3 0 0 1 0-6h3M17 7h2a3 3 0 0 1 0 6h-3", key: "connect" }],
]);
export const QuickServeDevices = createLucideIcon("QuickServeDevices", [
  ["rect", { x: "5", y: "3", width: "14", height: "18", rx: "2", key: "device" }],
  ["path", { d: "M10 18h4", key: "bar" }],
]);
export const QuickServeProfile = createLucideIcon("QuickServeProfile", [
  ["circle", { cx: "12", cy: "8", r: "3", key: "profile" }],
  ["path", { d: "M5 21a7 7 0 0 1 14 0", key: "body" }],
]);
