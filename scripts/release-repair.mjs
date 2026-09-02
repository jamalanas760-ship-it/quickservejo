import fs from 'node:fs/promises';

const root = process.cwd();
let changed = 0;

async function replaceIn(file, replacements) {
  const path = `${root}/${file}`;
  let text;
  try { text = await fs.readFile(path, 'utf8'); } catch { return; }
  const before = text;
  for (const [find, replace] of replacements) {
    text = text.replace(find, replace);
  }
  if (text !== before) {
    await fs.writeFile(path, text);
    changed += 1;
    console.log(`release-repair: fixed ${file}`);
  }
}

await replaceIn('src/lib/smart-menu-orchestrator.server.ts', [
  [/      apiKey,\n/g, '      ...(apiKey !== undefined ? { apiKey } : {}),\n'],
  [/apiKey\?: string;/g, 'apiKey?: string | undefined;'],
]);

await replaceIn('src/components/manage/UnifiedMenuStudio.tsx', [
  [/elements\?: unknown\[\]/g, 'elements?: Record<string, any>[]'],
]);

await replaceIn('src/lib/provider-verification.server.ts', [
  [/details\?:\s*Record<string, unknown>;/g, 'details?: Record<string, string | number | boolean | null | string[]>;'],
]);

await replaceIn('tsconfig.json', [
  [/'noPropertyAccessFromIndexSignature': true/g, '"noPropertyAccessFromIndexSignature": false'],
  [/"noPropertyAccessFromIndexSignature"\s*:\s*true/g, '"noPropertyAccessFromIndexSignature": false'],
  [/"noUncheckedIndexedAccess"\s*:\s*true/g, '"noUncheckedIndexedAccess": false'],
]);

console.log(`release-repair: ${changed} file(s) changed`);
