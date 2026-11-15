import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import type { Agent, AgentContext, AgentResult, CodeMap, LegacyCodeInput } from './types.js';
import { invokeModel } from '../api/services/llm.js';
import { parseLegacyCode } from '../parser/legacy-parser.js';

export type ArchaeologyOutput = {
  codeMap: CodeMap;
  intentPath: string;
  codeMapPath: string;
};

const CodeMapSchema = z.object({
  functions: z
    .array(
      z.object({
        name: z.string(),
        signature: z.string().default(''),
        lineStart: z.number().default(0),
        lineEnd: z.number().default(0),
        description: z.string().default('')
      })
    )
    .default([]),
  globals: z.array(z.string()).default([]),
  sideEffects: z.array(z.string()).default([]),
  dbCalls: z.array(z.string()).default([]),
  externalDeps: z.array(z.string()).default([]),
  businessRules: z.array(z.string()).default([])
});

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

/**
 * Extracts and parses a JSON object from LLM output, handling markdown fences,
 * surrounding text, and trailing commas.
 */
export function extractJson(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = (fenceMatch ? fenceMatch[1] : text).trim();

  if (!candidate.startsWith('{') && !candidate.startsWith('[')) {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidate = candidate.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(candidate);
  } catch {
    const sanitized = candidate.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(sanitized);
  }
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
  merged.globals = [...new Set(merged.globals)];
  merged.sideEffects = [...new Set(merged.sideEffects)];
  merged.dbCalls = [...new Set(merged.dbCalls)];
  merged.externalDeps = [...new Set(merged.externalDeps)];
  merged.businessRules = [...new Set(merged.businessRules)];
  return merged;
}

function formatFileIntentSection(
  fileName: string,
  language: string,
  lineCount: number,
  fileCodeMap: CodeMap
): string {
  const fnLines =
    fileCodeMap.functions.length > 0
      ? fileCodeMap.functions
          .map(
            (fn) =>
              `- **\`${fn.signature || fn.name}\`** (lines ${fn.lineStart}-${fn.lineEnd}): ${fn.description}`
          )
          .join('\n')
      : '- No functions extracted';

  const ruleLines =
    fileCodeMap.businessRules.length > 0
      ? fileCodeMap.businessRules.map((r) => `- ${r}`).join('\n')
      : '- None identified';

  return [
    `### ${fileName} (${language}, ${lineCount} lines)`,
    '',
    '#### Functions',
    fnLines,
    '',
    '#### Business Rules',
    ruleLines,
    ''
  ].join('\n');
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
        const pct = Math.round(20 + (i / input.files.length) * 55);
        context.onProgress(`Analyzing ${file.name} (${file.language})...`, pct);

        const parsed = parseLegacyCode(file.content, file.language);

        const staticFunctionList =
          parsed.functionDetails.length > 0
            ? parsed.functionDetails
                .map((f) => `${f.signature} [lines ${f.lineStart}-${f.lineEnd}]`)
                .join('; ')
            : 'none';

        const prompt = `Analyze this ${file.language} legacy code file named "${file.name}".

\`\`\`${file.language}
${file.content}
\`\`\`

Static parser pre-extraction (${parsed.lineCount} lines):
- Functions: ${staticFunctionList}
- Globals: ${parsed.globals.join(', ') || 'none'}
- Database calls detected: ${parsed.dbCalls.join(' | ') || 'none'}
- Side effects detected: ${parsed.sideEffects.join(' | ') || 'none'}
- External dependencies: ${parsed.externalDeps.join(', ') || 'none'}`;

        const result = await invokeModel({
          messages: [{ role: 'user', content: prompt }],
          system: SYSTEM_PROMPT,
          temperature: 0.2,
          maxTokens: 4096
        });

        const rawParsed = extractJson(result.content);
        const validated = CodeMapSchema.parse(rawParsed);

        // Merge static findings with LLM extraction so statically detected artifacts are always captured
        const fileCodeMap: CodeMap = {
          functions: validated.functions.map((fn) => {
            const staticMatch = parsed.functionDetails.find((s) => s.name === fn.name);
            return {
              name: fn.name,
              signature: fn.signature || staticMatch?.signature || `${fn.name}()`,
              lineStart: fn.lineStart || staticMatch?.lineStart || 0,
              lineEnd: fn.lineEnd || staticMatch?.lineEnd || 0,
              description: fn.description
            };
          }),
          globals: [...new Set([...validated.globals, ...parsed.globals])],
          sideEffects: [...new Set([...validated.sideEffects, ...parsed.sideEffects])],
          dbCalls: [...new Set([...validated.dbCalls, ...parsed.dbCalls])],
          externalDeps: [...new Set([...validated.externalDeps, ...parsed.externalDeps])],
          businessRules: [...new Set(validated.businessRules)]
        };

        codeMaps.push(fileCodeMap);
        intentParts.push(
          formatFileIntentSection(file.name, file.language, parsed.lineCount, fileCodeMap)
        );
      }

      context.onProgress('Merging code maps...', 80);
      const mergedCodeMap = mergeCodeMaps(codeMaps);

      context.onProgress('Generating intent document...', 90);
      const intentContent = [
        '# Code Archaeology Intent Document',
        '',
        `Generated: ${new Date().toISOString()}`,
        `Target Stack: ${input.targetStack}`,
        '',
        '## Module Summary',
        `- **Files analyzed**: ${input.files.map((f) => f.name).join(', ')}`,
        `- **Functions identified**: ${mergedCodeMap.functions.length}`,
        `- **Global variables**: ${mergedCodeMap.globals.length}`,
        `- **Database calls**: ${mergedCodeMap.dbCalls.length}`,
        `- **Side effects**: ${mergedCodeMap.sideEffects.length}`,
        `- **External dependencies**: ${mergedCodeMap.externalDeps.length}`,
        `- **Business rules**: ${mergedCodeMap.businessRules.length}`,
        '',
        '## Extracted Business Rules',
        mergedCodeMap.businessRules.map((r) => `- ${r}`).join('\n') || '- None identified',
        '',
        '## Database Interactions',
        mergedCodeMap.dbCalls.map((d) => `- ${d}`).join('\n') || '- None identified',
        '',
        '## Side Effects & Global State Risks',
        '### Globals',
        mergedCodeMap.globals.map((g) => `- \`${g}\``).join('\n') || '- None identified',
        '',
        '### Side Effects',
        mergedCodeMap.sideEffects.map((s) => `- ${s}`).join('\n') || '- None identified',
        '',
        '### External Dependencies',
        mergedCodeMap.externalDeps.map((e) => `- ${e}`).join('\n') || '- None identified',
        '',
        '## Per-File Function Breakdown',
        '',
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
