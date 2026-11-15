import fs from 'fs/promises';
import path from 'path';
import type { Agent, AgentContext, AgentResult, CodeMap } from './types.js';
import { invokeModel } from '../api/services/llm.js';

type TestAgentInput = {
  modernizedFiles: string[];
  codeMap: CodeMap;
  targetStack: string;
};

type TestAgentOutput = {
  testFiles: string[];
};

function getTestSystemPrompt(targetStack: string): string {
  const stack = targetStack.toLowerCase();
  if (stack === 'typescript') {
    return `You are an expert in property-based testing with fast-check and Vitest. Generate comprehensive property-based tests for the provided TypeScript code.

Requirements:
- Use fast-check for property-based tests (import * as fc from 'fast-check')
- Use Vitest for the test runner (import { describe, it, expect } from 'vitest')
- Cover: input/output equivalence, edge cases (empty strings, null-like, very large numbers), and business rules
- Each test should use fc.assert with fc.property
- Include at least one test per exported function
- Include edge case tests with fc.constantFrom for specific values
- Return ONLY valid TypeScript test code, no markdown fences`;
  }
  if (stack === 'python') {
    return `You are an expert in property-based testing with Hypothesis. Generate comprehensive property-based tests for the provided Python code.

Requirements:
- Use hypothesis for property-based tests (from hypothesis import given, strategies as st)
- Use pytest for the test runner
- Cover: input/output equivalence, edge cases, and business rules
- Include at least one @given test per function
- Return ONLY valid Python test code, no markdown fences`;
  }
  return `You are an expert in Go testing. Generate comprehensive table-driven tests for the provided Go code.

Requirements:
- Use the standard testing package
- Use table-driven tests with test cases covering normal, edge, and error cases
- Cover all exported functions
- Return ONLY valid Go test code, no markdown fences`;
}

function getTestFileExtension(targetStack: string): string {
  switch (targetStack.toLowerCase()) {
    case 'typescript': return '.test.ts';
    case 'python': return '_test.py';
    case 'go': return '_test.go';
    default: return '.test.ts';
  }
}

export class TestAgent implements Agent<TestAgentInput, TestAgentOutput> {
  name = 'TestAgent';
  description = 'Generates property-based tests for modernized code';

  async run(
    input: TestAgentInput,
    context: AgentContext
  ): Promise<AgentResult<TestAgentOutput>> {
    const start = Date.now();
    const outputDir = path.join(context.outputDir, 'tests');

    try {
      context.onProgress('Starting test generation...', 0);
      await fs.mkdir(outputDir, { recursive: true });

      const testFiles: string[] = [];
      const systemPrompt = getTestSystemPrompt(input.targetStack);
      const testExt = getTestFileExtension(input.targetStack);

      if (input.modernizedFiles.length === 0) {
        throw new Error('No modernized files provided to TestAgent');
      }

      for (let i = 0; i < input.modernizedFiles.length; i++) {
        const filePath = input.modernizedFiles[i];
        const pct = Math.round(10 + (i / input.modernizedFiles.length) * 80);
        context.onProgress(`Generating tests for ${path.basename(filePath)}...`, pct);

        const modernCode = await fs.readFile(filePath, 'utf-8');

        const prompt = `Generate property-based tests for this ${input.targetStack} code.

SOURCE FILE: ${path.basename(filePath)}
\`\`\`${input.targetStack}
${modernCode}
\`\`\`

Business rules to test:
${input.codeMap.businessRules.map((r) => `- ${r}`).join('\n') || 'None documented'}

Functions to test:
${input.codeMap.functions.map((f) => `- ${f.name}: ${f.description}`).join('\n') || 'None documented'}`;

        const result = await invokeModel({
          messages: [{ role: 'user', content: prompt }],
          system: systemPrompt,
          temperature: 0.2,
          maxTokens: 4096
        });

        let testCode = result.content.trim();
        const fenceMatch = testCode.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          testCode = fenceMatch[1].trim();
        }

        const baseName = path.basename(filePath, path.extname(filePath));
        const testFileName = `${baseName}${testExt}`;
        const testFilePath = path.join(outputDir, testFileName);
        await fs.writeFile(testFilePath, testCode, 'utf-8');
        testFiles.push(testFilePath);
      }

      context.onProgress('Test generation complete', 100);

      return {
        success: true,
        output: { testFiles },
        durationMs: Date.now() - start
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, durationMs: Date.now() - start };
    }
  }
}
