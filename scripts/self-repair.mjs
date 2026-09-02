import fs from 'node:fs/promises';

const root = process.cwd();

const fixes = [
  {
    file: 'src/components/manage/UnifiedMenuStudio.tsx',
    find: '  const liveMenuUrl = restaurant.data?.slug ? `${window.location.origin}/r/${encodeURIComponent(restaurant.data.slug)}` : "";\n',
    replace: '  const liveOrigin = typeof window !== "undefined" ? window.location.origin : "";\n  const liveMenuUrl = restaurant.data?.slug && liveOrigin ? `${liveOrigin}/r/${encodeURIComponent(restaurant.data.slug)}` : "";\n',
  },
  {
    file: 'src/routes/__root.tsx',
    find: '    const onMessage = (event: MessageEvent) => apply(event.data);\n',
    replace: '    const onMessage = (event: MessageEvent) => {\n      if (event.origin !== window.location.origin) return;\n      apply(event.data);\n    };\n',
  },
  {
    file: 'src/routes/_authenticated/manage/$restaurantId/route.tsx',
    find: 'import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";\n',
    replace: 'import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";\nimport type { CSSProperties } from "react";\n',
  },
  {
    file: 'src/routes/_authenticated/manage/$restaurantId/route.tsx',
    find: 'style={{ "--restaurant-accent": accent } as React.CSSProperties}',
    replace: 'style={{ "--restaurant-accent": accent } as CSSProperties}',
  },
  {
    file: 'src/routes/_authenticated/profile.tsx',
    find: 'import { Bell, Building2, Check, Coins, LogOut, Mail, Palette, Percent, Phone, ShieldCheck, User, Users } from "lucide-react";\n',
    replace: 'import { Bell, Building2, Check, Coins, LogOut, Mail, Palette, Percent, Phone, User, Users } from "lucide-react";\n',
  },
];

let changed = 0;
for (const fix of fixes) {
  const path = `${root}/${fix.file}`;
  let text;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch {
    continue;
  }
  if (!text.includes(fix.find)) continue;
  const next = text.replace(fix.find, fix.replace);
  if (next !== text) {
    await fs.writeFile(path, next);
    changed += 1;
    console.log(`self-repair: fixed ${fix.file}`);
  }
}

const mobileCss = `${root}/src/components/manage/MenuDesignMobileUX.css`;
try {
  let css = await fs.readFile(mobileCss, 'utf8');
  const guard = '\n/* Self-repair guard: the studio must never create document-width overflow. */\n@media(max-width:640px){.menu-design-studio{overflow-x:clip!important;max-width:100vw!important}.menu-design-studio .studio-preview-stage{overflow-x:hidden!important}.menu-design-studio iframe{max-width:100%!important}}\n';
  if (!css.includes('Self-repair guard: the studio must never create document-width overflow.')) {
    css += guard;
    await fs.writeFile(mobileCss, css);
    changed += 1;
    console.log('self-repair: added mobile overflow guard');
  }
} catch {}

console.log(`self-repair: ${changed} change(s)`);
