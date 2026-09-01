figma.showUI(`<!doctype html><html><body style="font:12px Inter,sans-serif;padding:16px"><strong>QuickServe Smart Menu Bridge</strong><p>Use the QuickServe app to send the selected DesignGraph into this open Figma file.</p></body></html>`, { width: 320, height: 180 });

function hexToRgb(hex) {
  const clean = String(hex || "#FFFFFF").replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean;
  const n = Number.parseInt(value, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

async function loadFont(node, family, style) {
  try {
    await figma.loadFontAsync({ family: family || "Inter", style: style || "Regular" });
  } catch {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  }
}

async function renderGraph(graph) {
  const frame = figma.createFrame();
  frame.name = `QuickServe — ${graph.id}`;
  frame.resize(graph.canvas.width, graph.canvas.height);
  frame.fills = [{ type: "SOLID", color: hexToRgb(graph.canvas.background) }];

  for (const element of [...graph.elements].sort((a, b) => (a.z || 0) - (b.z || 0))) {
    const x = (element.x / 100) * graph.canvas.width;
    const y = (element.y / 100) * graph.canvas.height;
    const w = Math.max(1, (element.w / 100) * graph.canvas.width);
    const h = Math.max(1, (element.h / 100) * graph.canvas.height);

    if (["title", "copy", "category", "price", "eyebrow"].includes(element.type)) {
      const node = figma.createText();
      await loadFont(node, element.fontFamily, element.fontWeight && element.fontWeight >= 600 ? "Bold" : "Regular");
      node.name = element.id;
      node.characters = element.text || "";
      node.x = x;
      node.y = y;
      node.resize(w, h);
      node.fontSize = element.fontSize || 16;
      node.fills = [{ type: "SOLID", color: hexToRgb(element.color || "#111111") }];
      node.opacity = element.opacity ?? 1;
      node.rotation = element.rotation || 0;
      node.textAlignHorizontal = element.align === "center" ? "CENTER" : element.align === "right" ? "RIGHT" : "LEFT";
      frame.appendChild(node);
      continue;
    }

    const node = figma.createRectangle();
    node.name = element.id;
    node.x = x;
    node.y = y;
    node.resize(w, h);
    node.opacity = element.opacity ?? 1;
    node.rotation = element.rotation || 0;
    node.fills = [{ type: "SOLID", color: hexToRgb(element.color || "#D9D9D9") }];
    frame.appendChild(node);
  }

  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
}

figma.ui.onmessage = async (message) => {
  if (message.type !== "render-graph") return;
  try {
    await renderGraph(message.graph);
    figma.notify("QuickServe design imported successfully");
  } catch (error) {
    figma.notify(`QuickServe import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};
