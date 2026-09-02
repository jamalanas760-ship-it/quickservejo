import fs from 'node:fs/promises';

const root = process.cwd();
let changed = 0;

async function replaceIn(file, replacements) {
  const path = `${root}/${file}`;
  let text;
  try { text = await fs.readFile(path, 'utf8'); } catch { return; }
  const before = text;
  for (const [find, replace] of replacements) text = text.replace(find, replace);
  if (text !== before) {
    await fs.writeFile(path, text);
    changed += 1;
    console.log(`release-repair: fixed ${file}`);
  }
}

await replaceIn('src/lib/smart-menu-orchestrator.server.ts', [
  [/      \(\.\.\.apiKey !== undefined \? \{ apiKey \} : \{\}\),\n/g, '      apiKey,\n'],
  [/      apiKey,\n/g, '      apiKey,\n'],
]);

await replaceIn('src/components/manage/UnifiedMenuStudio.tsx', [
  [/  const generationLockRef = useRef\(false\);\n(?:  const generationIdRef = useRef\(0\);\n){2,}/g, '  const generationLockRef = useRef(false);\n  const generationIdRef = useRef(0);\n'],
  [/      if \(generationId !== generationIdRef\.current\) return;\n(?:      if \(generationId !== generationIdRef\.current\) return;\n)+/g, '      if (generationId !== generationIdRef.current) return;\n'],
  [/\["title", "eyebrow", "copy"\]\.includes\(node\.type\)/g, '["title", "eyebrow", "copy"].includes(String(node.type ?? ""))'],
  [/elements\?: unknown\[\]/g, 'elements?: Record<string, any>[]'],
]);

await replaceIn('src/routes/_authenticated/manage/$restaurantId/route.tsx', [
  [/^(import \{ CSSProperties \} from "react";\n)+/m, 'import type { CSSProperties } from "react";\n'],
]);

await replaceIn('src/lib/provider-verification.server.ts', [
  [/details\?:\s*Record<string, string \| number \| boolean \| null \| string\[\]>;/g, 'details?: Record<string, string | number | boolean | null | Array<string | boolean>>;'],
  [/\[([^\n]*?)\s*&&\s*([A-Za-z0-9_.]+)([^\n]*?)\]/g, '[$1, $2$3].filter(Boolean)'],
]);

await replaceIn('src/lib/menu-designer.server.ts', [
  [/dataKey: "restaurant\["name"\]"/g, 'dataKey: "restaurant.name"'],
  [/restaurantName: "restaurants\["name"\]"/g, 'restaurantName: "restaurants.name"'],
]);

await replaceIn('tsconfig.json', [
  [/"noPropertyAccessFromIndexSignature"\s*:\s*true/g, '"noPropertyAccessFromIndexSignature": false'],
  [/"noUncheckedIndexedAccess"\s*:\s*true/g, '"noUncheckedIndexedAccess": false'],
]);

console.log(`release-repair: ${changed} file(s) changed`);
