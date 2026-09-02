import fs from 'node:fs/promises';

const root = process.cwd();
let changed = 0;

async function edit(file, transform) {
  const path = `${root}/${file}`;
  let text;
  try { text = await fs.readFile(path, 'utf8'); } catch { return; }
  const next = transform(text);
  if (next !== text) {
    await fs.writeFile(path, next);
    changed += 1;
    console.log(`ai-menu-hardening: fixed ${file}`);
  }
}

await edit('src/lib/menu-designer.server.ts', (text) => {
  text = text.replace(
    'export async function callMenuDesigner(input: unknown[], apiKey?: string): Promise<string> {\n  if (!apiKey?.trim()) return localDesignFallback(input);',
    'export async function callMenuDesigner(input: unknown[], apiKey?: string, allowFallback = true): Promise<string> {\n  if (!apiKey?.trim()) {\n    if (!allowFallback) throw new Error("Real AI Menu Studio is not configured. Add OPENAI_API_KEY on the server; the studio will not pretend a deterministic fallback is AI.");\n    return localDesignFallback(input);\n  }',
  );
  text = text.replace(
    'body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || MENU_MODEL, input, store: false, max_output_tokens: 8000 }),',
    'body: JSON.stringify({ model: process.env["OPENAI_MENU_MODEL"] || MENU_MODEL, input, store: false, max_output_tokens: 12000, text: { format: { type: "json_object" } } }),',
  );
  text = text.replace(
    '      return localDesignFallback(input);\n    }\n\n    const text =',
    '      if (!allowFallback) throw new Error(`OpenAI Menu Studio request failed (${response.status}): ${payload.error?.message ?? "unknown API error"}`);\n      return localDesignFallback(input);\n    }\n\n    const text =',
  );
  text = text.replace(
    '    if (!text.trim() || extractDesigns(text).length === 0) return localDesignFallback(input);\n    return text;\n  } catch (error) {\n    console.error("OpenAI menu designer request failed; using native fallback", error instanceof Error ? error.message : error);\n    return localDesignFallback(input);',
    '    if (!text.trim() || extractDesigns(text).length === 0) {\n      if (!allowFallback) throw new Error("OpenAI returned no valid menu design JSON. The AI result was rejected instead of showing a fake deterministic design.");\n      return localDesignFallback(input);\n    }\n    return text;\n  } catch (error) {\n    console.error("OpenAI menu designer request failed", error instanceof Error ? error.message : error);\n    if (!allowFallback) throw error instanceof Error ? error : new Error("OpenAI Menu Studio request failed");\n    return localDesignFallback(input);',
  );
  return text;
});

await edit('src/lib/smart-menu-orchestrator.server.ts', (text) => {
  text = text.replace(
    '    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];\n    const references = data.references ?? [];',
    '    const apiKey = process.env["OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEYS"];\n    if (!apiKey?.trim()) throw new Error("AI Menu Studio requires a real server-side OPENAI_API_KEY. Configure the key before generating; QuickServe will never present a fallback as real AI.");\n    const references = data.references ?? [];',
  );
  text = text.replace(
    '    const seed = data.variationSeed ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;',
    '    const seed = data.variationSeed ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;\n    const runId = `${seed}-${Math.random().toString(36).slice(2, 8)}`;',
  );
  text = text.replace(
    '      `CREATIVE VARIATION SEED: ${seed}`,',
    '      `CREATIVE VARIATION SEED: ${seed}`,\n      `UNIQUE RUN ID: ${runId}`,\n      "Do not reuse a prior composition. The run must materially respond to the current prompt/reference. Compare the three concepts for duplicate structure before returning them.",',
  );
  text = text.replace(
    '      ], apiKey);',
    '      ], apiKey, false);',
  );
  text = text.replace(
    '    const text = await callMenuDesigner([',
    '    const text = await callMenuDesigner([',
  );
  return text;
});

await edit('src/lib/menu-quality-gate.server.ts', (text) => {
  text = text.replace('  if (!apiKey || designs.length === 0) {', '  if (!apiKey || designs.length === 0) {');
  text = text.replace('  ], apiKey);', '  ], apiKey, false);');
  return text;
});

await edit('src/components/manage/UnifiedMenuStudio.tsx', (text) => {
  text = text.replace(
    '  const [composition, setComposition] = useState<Composition>();\n',
    '  const [composition, setComposition] = useState<Composition>();\n  const [analysis, setAnalysis] = useState("");\n',
  );
  text = text.replace(
    '      if (generationId !== generationIdRef.current) return;\n      if (generationId !== generationIdRef.current) return;\n      if (generationId !== generationIdRef.current) return;\n      if (generationId !== generationIdRef.current) return;',
    '      if (generationId !== generationIdRef.current) return;',
  );
  text = text.replace(
    '      const next = result.concepts.map(c => ({ id: c.id, theme: c.theme }));',
    '      setAnalysis(result.analysis ?? "");\n      const next = result.concepts.map(c => ({ id: c.id, theme: c.theme }));',
  );
  const marker = '  const PreviewPanel = () => <main className="studio-preview-panel';
  if (!text.includes('const AnalysisPanel = () =>')) {
    text = text.replace(
      marker,
      `  const AnalysisPanel = () => {\n    let parsed: any = {};\n    try { parsed = analysis ? JSON.parse(analysis) : {}; } catch { parsed = {}; }\n    const dna = parsed?.referenceAnalysis?.visualDNA || parsed?.visualDNA || "Awaiting forensic visual analysis";\n    const priorities = Array.isArray(parsed?.referenceAnalysis?.fidelityPriorities) ? parsed.referenceAnalysis.fidelityPriorities.slice(0, 4) : [];\n    return <section className="mt-2 rounded-2xl border bg-white p-4 shadow-sm">\n      <div className="flex items-center justify-between gap-3">\n        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-black/40">AI forensic analysis</div><div className="mt-1 text-sm font-bold">{references.length ? "Reference image analyzed" : "Prompt analyzed"}</div></div>\n        <div className="rounded-full bg-black px-2.5 py-1 text-[10px] font-bold text-white">Visual DNA</div>\n      </div>\n      <p className="mt-3 text-xs leading-5 text-black/60">{String(dna)}</p>\n      {priorities.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{priorities.map((item: string, i: number) => <div key={i} className="rounded-xl bg-black/[.04] p-2.5 text-[11px] font-semibold text-black/65">{item}</div>)}</div>}\n      {!analysis && <div className="mt-3 rounded-xl bg-black/[.04] p-3 text-xs text-black/45">Generate a design to see the actual AI analysis here.</div>}\n    </section>;\n  };\n\n${marker}`,
    );
  }
  text = text.replace(
    '    </div>\n    <div className="mt-2 flex flex-wrap items-center justify-between',
    '    </div>\n    <AnalysisPanel />\n    <div className="mt-2 flex flex-wrap items-center justify-between',
  );
  return text;
});

console.log(`ai-menu-hardening: ${changed} file(s) changed`);
