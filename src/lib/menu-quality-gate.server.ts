import { callMenuDesigner, extractDesigns, DESIGN_SCHEMA } from "@/lib/menu-designer.server";

const QUALITY_SCHEMA = `Return JSON only: {"scores":[{"concept":1,"visualQuality":0,"briefFidelity":0,"hierarchy":0,"editability":0,"originality":0,"mobileReadiness":0,"score":0,"issues":[""],"strengths":[""]}],"winner":1,"criticalFixes":[""]}. Scores are 0-10.`;

const QUALITY_SYSTEM = `You are QuickServe's ruthless senior design critic and creative quality director. Evaluate structured restaurant menu concepts as if they were going to be published by a world-class hospitality brand.

Do not reward generic SaaS aesthetics, decorative noise, repetitive cards, weak typography, poor hierarchy, arbitrary spacing, or designs that merely sound premium in prose. Judge the actual editable composition data.

Evaluate: visual quality, fidelity to the user's brief/reference analysis, information hierarchy, typography, composition/balance, editability, originality, mobile readiness, content realism, and commercial menu usability. Concept 1 should win when exact/reference recreation was requested unless another concept genuinely satisfies the source better.

Be strict. Identify concrete issues that a second designer can fix. Return JSON only.`;

export async function runMenuQualityGate({
  designs,
  brief,
  visualAnalysis,
  exactReference,
  apiKey,
}: {
  designs: unknown[];
  brief: string;
  visualAnalysis: string;
  exactReference: boolean;
  apiKey: string | undefined;
}) {
  if (!apiKey || designs.length === 0) {
    return { designs, winner: 0, scores: [], criticalFixes: [] as string[] };
  }

  const critique = await callMenuDesigner([
    { role: "system", content: [{ type: "input_text", text: QUALITY_SYSTEM }] },
    { role: "user", content: [{ type: "input_text", text: `${QUALITY_SCHEMA}\n\nUSER BRIEF:\n${brief || "none"}\n\nREFERENCE ANALYSIS:\n${visualAnalysis}\n\nEXACT RECREATION REQUEST: ${exactReference}\n\nCONCEPTS:\n${JSON.stringify(designs)}` }] },
  ], apiKey, false);

  let parsed: { scores?: Array<{ concept?: number; score?: number; issues?: string[]; strengths?: string[] }>; winner?: number; criticalFixes?: string[] } = {};
  try { parsed = JSON.parse(critique) as typeof parsed; } catch { parsed = {}; }

  const winner = Math.max(0, Math.min(designs.length - 1, (parsed.winner ?? 1) - 1));
  const winningDesign = designs[winner];
  const fixes = (parsed.criticalFixes ?? []).slice(0, 8);

  const refinement = await callMenuDesigner([
    { role: "system", content: [{ type: "input_text", text: `You are the final QuickServe production designer. Refine ONE existing editable menu concept without replacing its identity with a generic template. Preserve the user's source-of-truth requirements and real content. Fix every issue in the quality gate. Improve composition, hierarchy, typography, spacing, image treatment, responsiveness and production polish where needed. If exact recreation was requested, do not creatively drift from the reference. Return ${DESIGN_SCHEMA}` }] },
    { role: "user", content: [{ type: "input_text", text: `QUALITY-GATE SCORECARD:\n${JSON.stringify(parsed)}\n\nCRITICAL FIXES:\n${fixes.join("\n- ")}\n\nWINNING CONCEPT:\n${JSON.stringify(winningDesign)}` }] },
  ], apiKey, false);

  const refined = extractDesigns(refinement)[0];
  if (!refined) return { designs, winner, scores: parsed.scores ?? [], criticalFixes: fixes };

  const finalDesigns = designs.map((design, index) => index === winner ? refined : design);
  return { designs: finalDesigns, winner, scores: parsed.scores ?? [], criticalFixes: fixes };
}
