figma.showUI(__html__, { width: 420, height: 620 });

figma.ui.onmessage = async (message) => {
  if (message.type !== 'import') return;

  try {
    const design = typeof message.payload === 'string' ? JSON.parse(message.payload) : message.payload;
    const root = figma.createFrame();
    root.name = design.name || 'QuickServe AI Menu';
    root.resize(Number(design.width || 1080), Number(design.height || 1440));
    root.fills = [{ type: 'SOLID', color: hexToRgb(design.background || '#F7F3EA') }];

    const title = figma.createText();
    title.characters = design.title || 'Menu';
    title.fontSize = Number(design.titleSize || 64);
    title.x = 64;
    title.y = 64;
    root.appendChild(title);

    const items = Array.isArray(design.items) ? design.items : [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const name = figma.createText();
      name.characters = String(item.name || `Item ${index + 1}`);
      name.fontSize = Number(item.nameSize || 28);
      name.x = 64;
      name.y = 170 + index * 82;
      root.appendChild(name);

      const price = figma.createText();
      price.characters = String(item.price || '');
      price.fontSize = Number(item.priceSize || 24);
      price.x = 820;
      price.y = name.y;
      root.appendChild(price);
    }

    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    figma.ui.postMessage({ type: 'success', message: 'Editable menu imported into Figma.' });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Import failed.' });
  }
};

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}
