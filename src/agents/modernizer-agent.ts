import fs from 'fs/promises';
import path from 'path';
import type { Agent, AgentContext, AgentResult, CodeMap, LegacyCodeInput } from './types.js';
import { invokeModel } from '../api/services/llm.js';

type ModernizerInput = {
  files: LegacyCodeInput['files'];
  codeMap: CodeMap;
  targetStack: string;
};

type ModernizerOutput = {
  modernizedFiles: string[];
  decisionsPath: string;
};

function getFileExtension(targetStack: string): string {
  switch (targetStack.toLowerCase()) {
    case 'typescript': return '.ts';
    case 'python': return '.py';
    case 'go': return '.go';
    default:
      throw new Error(`Unsupported target stack: ${targetStack}`);
  }
}

const FIDELITY_RULES = `Behavioral fidelity requirements (99%-100% equivalence with legacy behavior):
- Zero unused constants: EVERY constant or limit derived from the legacy code (e.g., NUM_MAX, RESULT_MAX, COBOL PIC bounds, #define macros, Fortran PARAMETERs) MUST be actively checked and enforced in validation/computation — never emit dead constants.
- Enforce exact numeric bounds, signedness, and overflow checks: unsigned fields (e.g., COBOL PIC 9(n), C unsigned) MUST reject negative numbers and values exceeding their digit/type maximum; fixed-width computed results (e.g., PIC 9(6)) MUST validate against overflow.
- Preserve exact precision: fixed-point decimal fields (e.g., COBOL PIC ...V99) MUST use exact decimal arithmetic (Decimal in Python, scaled integer/exact rounding in TypeScript/Go) rather than lossy floating-point arithmetic.
- Preserve 1:1 I/O contracts: keep exact prompt strings, display messages, and calculation order.
- Modernize unsafe legacy C/C++ idioms (gets, strcpy, sprintf, raw pointer arithmetic) into bounds-checked, memory-safe equivalents while keeping identical input/output behavior.`;

function buildSystemPrompt(targetStack: string): string {
  const stack = targetStack.toLowerCase();
  if (stack === 'typescript') {
    return `You are an expert TypeScript developer modernizing legacy code. Rewrite the provided legacy code into idiomatic TypeScript with:
- Strict TypeScript types (no any unless unavoidable)
- Async/await instead of callbacks
- Proper error handling with typed exceptions
- Modern ES2022+ features
- Replace deprecated DB calls with parameterized queries using a placeholder client
- Extract magic numbers/strings to named constants
- Add JSDoc comments for every exported function

${FIDELITY_RULES}

Return ONLY the modernized TypeScript code, no explanation, no markdown fences.`;
  }
  if (stack === 'python') {
    return `You are an expert Python developer modernizing legacy code. Rewrite the provided legacy code into idiomatic Python 3.11+ with:
- Type hints on all functions
- dataclasses or Pydantic models for data structures (use decimal.Decimal for fixed-point currency/decimal legacy fields)
- async/await where applicable
- Proper exception handling
- Replace SQL string concatenation with parameterized queries
- Add docstrings for every function

${FIDELITY_RULES}

Return ONLY the modernized Python code, no explanation, no markdown fences.`;
  }
  if (stack === 'go') {
    return `You are an expert Go developer modernizing legacy code. Rewrite the provided legacy code into idiomatic Go with:
- Proper error handling (return errors, don't panic)
- Structs for data structures
- Interfaces for abstraction
- Parameterized SQL queries
- Go conventions (exported names, package structure)

${FIDELITY_RULES}

Return ONLY the modernized Go code, no explanation, no markdown fences.`;
  }
  throw new Error(`Unsupported target stack: ${targetStack}`);
}

function buildDecisionSystemPrompt(): string {
  return `You are a software architect documenting modernization decisions. Given legacy code and its modernized version, document the key decisions made.

Format your response as Markdown with these sections:
## Modernization Decisions
List each significant decision as: **Decision**: description, **Rationale**: why, **Trade-off**: what was sacrificed

Return Markdown only.`;
}

export class ModernizerAgent implements Agent<ModernizerInput, ModernizerOutput> {
  name = 'ModernizerAgent';
  description = 'Rewrites legacy code into a modern target stack with decision logging';

  async run(
    input: ModernizerInput,
    context: AgentContext
  ): Promise<AgentResult<ModernizerOutput>> {
    const start = Date.now();
    const outputDir = path.join(context.outputDir, 'modernized');

    try {
      context.onProgress('Starting code modernization...', 0);
      await fs.mkdir(outputDir, { recursive: true });

      const modernizedFiles: string[] = [];
      const decisions: string[] = ['# Modernization Decision Log\n'];
      const ext = getFileExtension(input.targetStack);
      const systemPrompt = buildSystemPrompt(input.targetStack);
      const decisionSystemPrompt = buildDecisionSystemPrompt();

      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const pct = Math.round(10 + (i / input.files.length) * 75);
        context.onProgress(`Modernizing ${file.name}...`, pct);

        const functionList =
          input.codeMap.functions.length > 0
            ? input.codeMap.functions
                .map((fn) => `- ${fn.name} (${fn.signature}): ${fn.description}`)
                .join('\n')
            : 'None documented';

        const prompt = `Modernize this ${file.language} file named "${file.name}" to ${input.targetStack}.

ORIGINAL CODE:
\`\`\`${file.language}
${file.content}
\`\`\`

Functions to preserve (maintain equivalent behavior and exported interfaces):
${functionList}

Globals & data definitions (enforce all bounds/types):
${input.codeMap.globals.map((g) => `- ${g}`).join('\n') || 'None documented'}

Business rules to preserve:
${input.codeMap.businessRules.map((r) => `- ${r}`).join('\n') || 'None documented'}

Side effects & I/O contracts:
${input.codeMap.sideEffects.map((s) => `- ${s}`).join('\n') || 'None documented'}

Database interactions to modernize with parameterized queries:
${input.codeMap.dbCalls.map((d) => `- ${d}`).join('\n') || 'None'}`;

        const modernResult = await invokeModel({
          messages: [{ role: 'user', content: prompt }],
          system: systemPrompt,
          temperature: 0.2,
          maxTokens: 8192
        });

        let modernCode = modernResult.content.trim();
        // Strip accidental fences
        const fenceMatch = modernCode.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          modernCode = fenceMatch[1].trim();
        }

        const baseName = path.basename(file.name, path.extname(file.name));
        const outputFileName = `${baseName}${ext}`;
        const outputFilePath = path.join(outputDir, outputFileName);
        await fs.writeFile(outputFilePath, modernCode, 'utf-8');
        modernizedFiles.push(outputFilePath);

        // Generate decision log for this file
        const decisionPrompt = `Legacy ${file.language} file "${file.name}" was modernized to ${input.targetStack}.

LEGACY:
\`\`\`${file.language}
${file.content.slice(0, 32000)}
\`\`\`

MODERN:
\`\`\`${input.targetStack}
${modernCode.slice(0, 32000)}
\`\`\`

Document the key modernization decisions made.`;

        const decisionResult = await invokeModel({
          messages: [{ role: 'user', content: decisionPrompt }],
          system: decisionSystemPrompt,
          temperature: 0.4,
          maxTokens: 4096
        });

        decisions.push(`\n## File: ${file.name}\n\n${decisionResult.content}`);
      }

      context.onProgress('Writing decision log...', 90);
      const decisionsPath = path.join(outputDir, 'decisions.md');
      await fs.writeFile(decisionsPath, decisions.join('\n'), 'utf-8');

      context.onProgress('Modernization complete', 100);

      return {
        success: true,
        output: { modernizedFiles, decisionsPath },
        durationMs: Date.now() - start
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, durationMs: Date.now() - start };
    }
  }
}
