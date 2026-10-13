import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_MENU_IMAGES,menuCardImage } from '../src/lib/menu-card-images.ts';

test('each empty Interface image resolves to its own bundled default', async()=>{
  assert.notEqual(DEFAULT_MENU_IMAGES.standard,DEFAULT_MENU_IMAGES.pdf);
  for(const mode of ['standard','pdf']){
    assert.equal(menuCardImage(mode,null),DEFAULT_MENU_IMAGES[mode]);
    assert.equal(menuCardImage(mode,''),DEFAULT_MENU_IMAGES[mode]);
    assert.equal(menuCardImage(mode,'   '),DEFAULT_MENU_IMAGES[mode]);
    const bytes=await readFile(new URL('../public'+DEFAULT_MENU_IMAGES[mode],import.meta.url));
    assert.equal(bytes.subarray(0,4).toString(),'RIFF');
    assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  }
});

test('configured images override defaults independently without changing stored preferences',()=>{
  const configured='https://example.com/my-menu.webp';
  assert.equal(menuCardImage('standard',configured),configured);
  assert.equal(menuCardImage('pdf',configured),configured);
  const settings={standardMenuCardImage:configured,pdfMenuCardImage:null};
  assert.equal(menuCardImage('standard',settings.standardMenuCardImage),configured);
  assert.equal(menuCardImage('pdf',settings.pdfMenuCardImage),DEFAULT_MENU_IMAGES.pdf);
  assert.equal(settings.pdfMenuCardImage,null);
});
