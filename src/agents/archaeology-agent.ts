import fs from 'fs/promises';
import path from 'path';
import type { Agent, AgentContext, AgentResult, CodeMap, LegacyCodeInput } from './types.js';
import { invokeModel } from '../api/services/llm.js';
import { parseLegacyCode } from '../parser/legacy-parser.js';

type ArchaeologyOutput = {
  codeMap: CodeMap;
  intentPath: string;
  codeMapPath: string;
};

const SYSTEM_PROMPT = `You are a code archaeology expert. Analyze legacy code and extract: function signatures, global variables, side effects, database calls, external dependencies, and implicit business rules.

Return a JSON object matching this exact schema:
{
  "functions": [{ "name": string, "signature": string, "lineStart": number, "lineEnd": number, "description": string }],
  "globals": string[],
  "sideEffects": string[],
  "dbCalls": string[],
  "externalDeps": string[],
  "businessRules": string[]
}

Return ONLY the JSON object, no markdown fences, no explanation.`;

function extractJson(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1] : text;
  return JSON.parse(jsonStr.trim());
}

const emptyCodeMap = (): CodeMap => ({
  functions: [],
  globals: [],
  sideEffects: [],
  dbCalls: [],
  externalDeps: [],
  businessRules: []
});

function mergeCodeMaps(maps: CodeMap[]): CodeMap {
  const merged = emptyCodeMap();
  for (const map of maps) {
    merged.functions.push(...(map.functions ?? []));
    merged.globals.push(...(map.globals ?? []));
    merged.sideEffects.push(...(map.sideEffects ?? []));
    merged.dbCalls.push(...(map.dbCalls ?? []));
    merged.externalDeps.push(...(map.externalDeps ?? []));
    merged.businessRules.push(...(map.businessRules ?? []));
  }
  // Deduplicate string arrays
  merged.globals = [...new Set(merged.globals)];
  merged.sideEffects = [...new Set(merged.sideEffects)];
  merged.dbCalls = [...new Set(merged.dbCalls)];
  merged.externalDeps = [...new Set(merged.externalDeps)];
  merged.businessRules = [...new Set(merged.businessRules)];
  return merged;
}

export class ArchaeologyAgent implements Agent<LegacyCodeInput, ArchaeologyOutput> {
  name = 'ArchaeologyAgent';
  description = 'Parses legacy code and extracts structured code map and business intent';

  async run(
    input: LegacyCodeInput,
    context: AgentContext
  ): Promise<AgentResult<ArchaeologyOutput>> {
    const start = Date.now();
    const outputDir = path.join(context.outputDir, 'archaeology');

    try {
      context.onProgress('Starting code archaeology...', 0);
      await fs.mkdir(outputDir, { recursive: true });

      const codeMaps: CodeMap[] = [];
      const intentParts: string[] = [];

      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const pct = Math.round(30 + (i / input.files.length) * 30);
        context.onProgress(`Parsing ${file.name}...`, pct);

        // Static parse first
        const parsed = parseLegacyCode(file.content, file.language);

        // LLM extraction
        const prompt = `Analyze this ${file.language} legacy code file named "${file.name}".

\`\`\`${file.language}
${file.content}
\`\`\`

Statically detected functions: ${parsed.functions.join(', ') || 'none'}
Line count: ${parsed.lineCount}`;

        let fileCodeMap: CodeMap;
        try {
          const result = await invokeModel({
            messages: [{ role: 'user', content: prompt }],
            system: SYSTEM_PROMPT,
            temperature: 0.2,
            maxTokens: 4096
          });

          fileCodeMap = extractJson(result.content) as CodeMap;
          intentParts.push(`## ${file.name}\n\n${result.content}`);
        } catch {
          // Fallback to static parse results
          fileCodeMap = {
            functions: parsed.functions.map((fn, idx) => ({
              name: fn,
              signature: fn + '()',
              lineStart: 0,
              lineEnd: 0,
              description: `Extracted function from ${file.name}`
            })),
            globals: parsed.globals,
            sideEffects: [],
            dbCalls: [],
            externalDeps: [],
            businessRules: []
          };
        }

        codeMaps.push(fileCodeMap);
      }

      context.onProgress('Merging code maps...', 60);
      const mergedCodeMap = mergeCodeMaps(codeMaps);

      context.onProgress('Generating intent document...', 90);
      const intentContent = [
        '# Code Archaeology Intent Document\n',
        `Generated: ${new Date().toISOString()}\n`,
        '## Summary\n',
        `Total functions identified: ${mergedCodeMap.functions.length}`,
        `Global variables: ${mergedCodeMap.globals.length}`,
        `Database calls: ${mergedCodeMap.dbCalls.length}`,
        `Business rules: ${mergedCodeMap.businessRules.length}\n`,
        '## Business Rules\n',
        mergedCodeMap.businessRules.map((r) => `- ${r}`).join('\n') || 'None identified',
        '\n## File Details\n',
        ...intentParts
      ].join('\n');

      const codeMapPath = path.join(outputDir, 'code-map.json');
      const intentPath = path.join(outputDir, 'intent.md');

      await fs.writeFile(codeMapPath, JSON.stringify(mergedCodeMap, null, 2), 'utf-8');
      await fs.writeFile(intentPath, intentContent, 'utf-8');

      context.onProgress('Archaeology complete', 100);

      return {
        success: true,
        output: { codeMap: mergedCodeMap, intentPath, codeMapPath },
        durationMs: Date.now() - start
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, durationMs: Date.now() - start };
    }
  }
}
