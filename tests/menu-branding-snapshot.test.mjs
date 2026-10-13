import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMenuBrandingTheme } from '../src/lib/menu-branding-snapshot.ts';
import { readAppearance } from '../src/lib/restaurant-appearance.ts';

test('publishing branding preserves newer Interface images and unrelated workspace settings', () => {
  const edited = readAppearance({workspace:{standardMenuCardImage:'https://old.example/standard.png',pdfMenuCardImage:'https://old.example/pdf.png'}});
  edited.guestMenuLight.primary = '#ff6600';
  const current = {layout:'existing-layout',workspace:{standardMenuCardImage:'https://new.example/standard.png',pdfMenuCardImage:'https://new.example/pdf.png',sidebarPinnedTools:['orders'],customFutureSetting:true}};
  const snapshot = mergeMenuBrandingTheme(current,edited);
  assert.equal(snapshot.layout,current.layout);
  assert.equal(snapshot.workspace.standardMenuCardImage,current.workspace.standardMenuCardImage);
  assert.equal(snapshot.workspace.pdfMenuCardImage,current.workspace.pdfMenuCardImage);
  assert.deepEqual(snapshot.workspace.sidebarPinnedTools,['orders']);
  assert.equal(snapshot.workspace.customFutureSetting,true);
  assert.equal(snapshot.workspace.guestMenuLight.primary,'#ff6600');
  assert.equal(current.workspace.guestMenuLight,undefined,'merge does not mutate the persisted object');
});

test('menu card images stay independent and reject non-HTTPS inputs', () => {
  const standardOnly = readAppearance({workspace:{standardMenuCardImage:'https://example.com/standard.webp'}});
  assert.equal(standardOnly.pdfMenuCardImage,null);
  const pdfOnly = readAppearance({workspace:{pdfMenuCardImage:'https://example.com/pdf.webp'}});
  assert.equal(pdfOnly.standardMenuCardImage,null);
  assert.equal(pdfOnly.pdfMenuCardImage,'https://example.com/pdf.webp');
  const bad = readAppearance({workspace:{standardMenuCardImage:'javascript:alert(1)',pdfMenuCardImage:'data:image/png;base64,abc'}});
  assert.equal(bad.standardMenuCardImage,null);
  assert.equal(bad.pdfMenuCardImage,null);
  assert.equal(mergeMenuBrandingTheme(null,readAppearance(null)).workspace.menuMode,'pdf');
});
