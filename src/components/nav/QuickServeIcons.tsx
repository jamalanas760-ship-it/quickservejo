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
