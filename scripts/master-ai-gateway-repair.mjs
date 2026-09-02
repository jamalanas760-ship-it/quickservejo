import fs from "node:fs";

const files = {
  orchestrator: "src/lib/smart-menu-orchestrator.server.ts",
  studio: "src/components/manage/UnifiedMenuStudio.tsx",
};

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, value) { if (value !== read(path)) fs.writeFileSync(path, value); }

// Keep the Master Studio's OpenAI credential resolution centralized and request-time.
{
  const path = files.orchestrator;
  let s = read(path);
  if (!s.includes('from "@/lib/openai-gateway.server"')) {
    s = s.replace(
      'import { runMenuQualityGate } from "@/lib/menu-quality-gate.server";',
      'import { runMenuQualityGate } from "@/lib/menu-quality-gate.server";\nimport { getOpenAIKey, verifyOpenAI } from "@/lib/openai-gateway.server";'
    );
  }
  s = s.replace(/\n\s*const apiKey = process\.env\["OPENAI_API_KEY"\] \?\? process\.env\["OPENAI_API_KEYS"\];\n\s*if \(!apiKey\?\.trim\(\)\) throw new Error\([^\n]+\);/, '\n    const apiKey = getOpenAIKey();\n    await verifyOpenAI();');
  // Ensure every Master Studio AI stage is real AI; never silently invoke a local template fallback.
  s = s.replace(/\],\s*apiKey\);/g, '], apiKey, false);');
  write(path, s);
}

// Idempotently collapse duplicate analysis state/hooks introduced by earlier repair passes.
{
  const path = files.studio;
  let s = read(path);
  const stateLine = '  const [analysis, setAnalysis] = useState("");';
  const stateRegex = /\n\s*const \[analysis, setAnalysis\] = useState\(""\);/g;
  s = s.replace(stateRegex, "");
  const firstHook = s.indexOf('  const [analysis, setAnalysis] = useState("");');
  if (firstHook < 0) {
    const anchor = '  const [composition, setComposition] = useState<Composition>();';
    s = s.replace(anchor, `${anchor}\n${stateLine}`);
  }
  // Collapse duplicate consecutive result assignments.
  s = s.replace(/(\n\s*setAnalysis\(result\.analysis \?\? ""\);){2,}/g, '\n      setAnalysis(result.analysis ?? "");');
  write(path, s);
}

console.log("Master AI gateway repair applied idempotently.");
