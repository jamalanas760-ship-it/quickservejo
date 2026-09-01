import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({});

function getSecret(name: string) {
  return process.env[name]?.trim() || null;
}

export type OpenAIRuntimeVerification = {
  connected: boolean;
  verified: boolean;
  status: "healthy" | "needs_configuration" | "unauthorized" | "forbidden" | "error";
  latencyMs: number | null;
  model: string | null;
  message: string;
  checkedAt: string;
};

export const verifyOpenAIRuntime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async () => {
    const apiKey = getSecret("OPENAI_API_KEY") ?? getSecret("OPENAI_API_KEYS");
    const model = getSecret("OPENAI_MENU_MODEL") ?? "gpt-5.6-luna";
    const checkedAt = new Date().toISOString();

    if (!apiKey) {
      return {
        connected: false,
        verified: false,
        status: "needs_configuration",
        latencyMs: null,
        model,
        message: "OPENAI_API_KEY or OPENAI_API_KEYS is not configured in the QuickServe server runtime.",
        checkedAt,
      } satisfies OpenAIRuntimeVerification;
    }

    const started = Date.now();
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: "Reply with exactly QUICKSERVE_OPENAI_RUNTIME_OK",
          max_output_tokens: 16,
        }),
      });
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        return {
          connected: false,
          verified: false,
          status: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "error",
          latencyMs,
          model,
          message: `OpenAI Responses API runtime verification failed (${response.status}).`,
          checkedAt,
        } satisfies OpenAIRuntimeVerification;
      }

      const body = await response.json() as { output_text?: string };
      const verified = body.output_text?.trim() === "QUICKSERVE_OPENAI_RUNTIME_OK";

      return {
        connected: true,
        verified,
        status: verified ? "healthy" : "error",
        latencyMs,
        model,
        message: verified
          ? "OpenAI Responses API is authenticated and responding from the QuickServe server runtime."
          : "OpenAI responded, but the runtime smoke-test response did not match the expected value.",
        checkedAt,
      } satisfies OpenAIRuntimeVerification;
    } catch (error) {
      return {
        connected: false,
        verified: false,
        status: "error",
        latencyMs: Date.now() - started,
        model,
        message: error instanceof Error ? `OpenAI runtime request failed: ${error.message}` : "OpenAI runtime request failed.",
        checkedAt,
      } satisfies OpenAIRuntimeVerification;
    }
  });
