/** Server-only AI menu designer helpers. */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
export const MENU_MODEL = "openai/gpt-5.6-luna";

export const DESIGN_SCHEMA = `Return {"designs":[d1,d2,d3]} and nothing else. Each design must contain the existing MenuTheme keys plus a composition object. composition = {version:1,concept:string,artDirection:string,background:{color:string,texture:string},elements:[...]} where each element is {id:string,type:title|eyebrow|image|copy|category|product|price|shape,x:number,y:number,w:number,h:number,rotation?:number,opacity?:number,text?:string,image?:string,color?:string,fontSize?:number,align?:left|center|right,shape?:square|rounded|circle|organic}. Coordinates are percentages of the artboard. The composition must be a real visual composition, not a card list. The three designs must be structurally different.

Also set the theme keys with these exact allowed values: template = classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness|duotone|gastro|terracotta|maroon|cocoa|playful; layout = list|grid|magazine|columns|gallery|mosaic|spotlight|rail|ticket|duo|triptych|panel; hero = cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar|medallion|spine|banner.`;

export const ART_DIRECTION = `You are the creative director of an elite restaurant menu studio with decades of print and digital hospitality design experience. Output must feel REALISTIC, HUMAN-MADE, MODERN and ART-DIRECTED — never basic, standard, templated or SaaS-looking.

NON-NEGOTIABLES:
- Do not use the default logo + title + category pills + repeated cards structure.
- Do not merely recolour the same layout.
- Make each of the three designs different in composition, hierarchy, typography, image treatment and material.
- Think like an expert restaurant branding agency: decide visual concept, composition, hierarchy, photography direction, cropping, negative space, rhythm, alignment, price treatment, decorative language and mobile behavior.
- Use asymmetry, editorial grids, overlapping imagery, full-bleed photography, dramatic whitespace, oversized typography, organic shapes, poster composition, photographic cutouts and tactile details when appropriate.
- Food photography is a primary design element. Prefer the restaurant's actual images and use realistic photography treatment; never make food look obviously synthetic.
- Treat Arabic and English as designed typography with correct RTL/LTR hierarchy.
- Branding is not required to be a top logo. It can be a signature, watermark, integrated mark, corner treatment, large wordmark or footer.
- Reference images are visual DNA: analyze composition, hierarchy, typography, texture, crops, spacing and contrast, then create an original design. Never clone protected logos/text.
- Motion should be subtle and purposeful.
- The composition object must contain positioned elements that the visual editor can select, move and refine. It should look like a professional art-directed canvas, not a schema dump.

REFERENCE ARCHETYPES — proven print structures from the studio's archive. Pick THREE different families per response and push each further:
1. Duotone bill of fare — template duotone, layout duo, hero medallion: black band, circular crest, FOOD / DRINK facing columns, dotted leader prices, photo strip.
2. Gastronomy broadsheet — template gastro, layout triptych, hero banner: cream stock, three narrow editorial columns, centred plated crops, filigree dividers.
3. Terracotta spine — template terracotta, layout columns, hero spine: sand + burnt orange colour spine with an oversized vertical MENU wordmark and floating round plates.
4. Maroon print sidebar — template maroon, layout panel, hero spine: deep maroon information column (hours, address) beside classic serif columns with leader dots.
5. Cocoa poster — template cocoa, layout panel, hero banner: enormous condensed headline, hairline rules, wine-red feature panel for specials.
6. Ink blob playful — template playful, layout duo, hero blob: organic black/amber blobs, script section pills, circular food crops, warm paper.

QUALITY BAR:
Would a premium restaurant realistically publish this? If not, improve it before returning it.
Stop designing menus as cards. Start designing them as visual experiences.`;

export async function callMenuDesigner(input: unknown[], apiKey: string): Promise<string> {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: MENU_MODEL, input, stream: true, store: false, max_output_tokens: 6000 }),
  });
  if (!response.ok || !response.body) {
    const details = await response.text().catch(() => "");
    console.error("AI menu designer gateway error", response.status, details.slice(0, 500));
    if (response.status === 429) throw new Error("The AI designer is busy right now. Please try again in a moment.");
    if (response.status === 402) throw new Error("AI credits are exhausted. Add credits to keep using the AI menu designer.");
    if (response.status === 403) throw new Error("AI access is blocked for this workspace.");
    if (response.status === 401) throw new Error("AI menu designer is not configured correctly.");
    throw new Error("AI menu generation is temporarily unavailable.");
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let text = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue; const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; response?: { output_text?: string } };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        else if (event.type === "response.completed" && !text && event.response?.output_text) text = event.response.output_text;
      } catch { /* ignore non-json frames */ }
    }
  }
  return text;
}

export function extractDesigns(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim(); const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try { const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { designs?: unknown }; return Array.isArray(parsed.designs) ? parsed.designs.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []; } catch { return []; }
}
