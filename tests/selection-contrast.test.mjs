import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const raw = await readFile(new URL('../src/lib/contrast.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { selectionPalette, contrastRatio } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

for (const dark of [false, true]) {
  test(`${dark ? 'dark' : 'light'} selected labels, icons and indicators remain readable with custom colors`, () => {
    for (const brand of ['#ff5a0a', '#ff7433', '#ffffff', '#000000', '#777777', '#ffff00', '#0000ff', '#00ff00', '#f0f', '#123456', 'invalid']) {
      const p = selectionPalette(brand, dark);
      for (const key of ['foreground', 'muted', 'icon']) assert.ok(contrastRatio(p[key], p.background) >= 4.5, `${brand} ${key}`);
      assert.ok(contrastRatio(p.indicator, p.background) >= 3, `${brand} indicator`);
    }
  });
}
test('tool selection never paints a hard-coded light-only surface', async () => {
  const css = await readFile(new URL('../src/quickserve-system.css', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/nav/BottomNav.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.qs-workspace-tool-card\.is-active\{\s*border-color:var\(--qs-selection-indicator\)!important;\s*background:var\(--qs-selection-background\)!important/);
  assert.match(css, /\.qs-workspace-tool-card\.is-active strong\{color:var\(--qs-selection-foreground\)!important/);
  assert.match(nav, /to=\{item.to as never\}\s+aria-current=\{active \? "page" : undefined\}/);
});
