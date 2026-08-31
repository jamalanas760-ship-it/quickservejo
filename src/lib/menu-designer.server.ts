/**
 * Server-only helpers for the AI menu designer.
 *
 * Calls the Lovable AI Gateway Responses API with `openai/gpt-5.6-luna`.
 * Every call streams (reasoning models can run for minutes and a buffered
 * request would be severed by the platform request timeout).
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";

export const MENU_MODEL = "openai/gpt-5.6-luna";

export const DESIGN_SCHEMA = `Return an object {"designs":[d1,d2,d3]} and nothing else. Each design must contain exactly these keys: template (classic|midnight|street|cafe|bold|chalkboard|sketch|bifold|editorial|breakfast|bakery|poster|coffeehouse|emerald|script|retro|brush|nautical|ornate|tiles|wellness), bg, surface, text, muted, primary, primaryText, accent (6-digit hex), bodyFont and headingFont (sans|serif|rounded|mono|display|condensed|script), layout (list|grid|magazine|columns|gallery|mosaic|spotlight|rail|ticket), hero (cover|gradient|minimal|chalk|stamp|ribbon|blob|sidebar), radius (0-32 integer), showImages (boolean), imageShape (rounded|circle|square), showIcons (boolean), buttonStyle (solid|pill|soft|outline), cardStyle (flat|elevated|outline|glass), bgStyle (solid|gradient|dots|glow), density (compact|comfortable|airy), animation (none|fade|rise|pop|slide), texture (none|chalk|paper|grain), decor (none|veg|fastfood|bakery|shapes|ornate|coffee|seafood), sectionStyle (plain|boxed|rule|tab|ribbon), priceStyle (inline|right|leader), columns (1 or 2), upperTitles (boolean), scriptAccent (boolean), tagline (max 5 words).`;

export const ART_DIRECTION = `You are the creative director of an elite restaurant menu studio with 25+ years of print and digital hospitality design behind you. Your output must read as REALISTIC, HUMAN-MADE, MODERN and ART-DIRECTED — never a basic, standard, templated or SaaS-looking menu.

Non-negotiables:
- Never produce a "default" menu: no generic white card list, no purple/indigo gradient, no interchangeable layout, no recolour of the same structure. Each of the three designs must differ in STRUCTURE (layout), HIERARCHY (hero + sectionStyle + priceStyle), TYPOGRAPHY pairing and material (texture/bgStyle) — not just colour.
- Commit to one decisive art direction per design, as if it were a real venue's printed menu photographed for a design annual: 2-3 core colours plus one accent, one clear focal point, generous intentional whitespace, confident display typography paired with a highly readable body font.
- Choose colours like a human designer: nuanced, slightly desaturated or deep and inky, warm neutrals, materials (paper cream, espresso brown, olive, terracotta, charcoal, oxidised brass) rather than pure #FFFFFF/#000000 or flat digital primaries. Ensure the text/background pairing is comfortably legible.
- Use texture (paper, chalk, grain) and decor line-art where the cuisine justifies it, so the design feels printed and tactile instead of flat UI.
- Use realistic food photography treatment when showImages is true: editorial crops, overlay galleries or mosaic bento rhythms; use printed/leader pricing for editorial and receipt-style menus and right-aligned pricing for modern minimal ones.
- Motion must be subtle and purposeful: fade/rise for premium and fine dining, pop/slide for street food and fast casual.
- Everything must stay highly legible on a mobile QR menu and work in Arabic RTL as well as English LTR.

Study any supplied reference images deeply — composition, grid, crops, typographic scale, spacing rhythm, texture, framing, decorative language and colour relationships — recreate that design DNA faithfully, then elevate it. Never copy logos or protected text.

Deliver three genuinely different creative directions, each one something a discerning restaurateur would pay for.`;

/** Streams a `/v1/responses` call and returns the concatenated output text. */
export async function callMenuDesigner(input: unknown[], apiKey: string): Promise<string> {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MENU_MODEL,
      input,
      stream: true,
      store: false,
      max_output_tokens: 6000,
    }),
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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && !text && event.response?.output_text) {
          text = event.response.output_text;
        }
      } catch {
        // ignore keep-alive / non-JSON frames
      }
    }
  }

  return text;
}

export function extractDesigns(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { designs?: unknown };
    return Array.isArray(parsed.designs)
      ? parsed.designs.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      : [];
  } catch {
    return [];
  }
}
