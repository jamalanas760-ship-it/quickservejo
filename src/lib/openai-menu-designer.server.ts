/** Direct OpenAI provider for the Menu Studio. The key is server-side only. */

const OPENAI_URL = "https://api.openai.com/v1/responses";
export const DEFAULT_MENU_MODEL = "gpt-5.6-terra";

export async function callOpenAIMenuDesigner(input: unknown[], apiKey: string, model = DEFAULT_MENU_MODEL): Promise<string> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      store: false,
      max_output_tokens: 12000,
      text: { format: { type: "json_object" } },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("OpenAI menu designer error", response.status, raw.slice(0, 1000));
    if (response.status === 401) throw new Error("The AI menu designer API key is invalid or not configured.");
    if (response.status === 429) throw new Error("The AI designer is temporarily rate-limited. Please try again shortly.");
    if (response.status === 402) throw new Error("The AI provider account has no available API balance.");
    throw new Error("The AI menu designer is temporarily unavailable.");
  }

  const parsed = JSON.parse(raw) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof parsed.output_text === "string" && parsed.output_text.trim()) return parsed.output_text;

  const text = (parsed.output ?? [])
    .flatMap(item => item.content ?? [])
    .map(item => item.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("The AI provider returned no design output.");
  return text;
}
