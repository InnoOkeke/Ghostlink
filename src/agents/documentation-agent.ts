import fs from 'fs/promises';
import path from 'path';
import type { Agent, AgentContext, AgentResult, CodeMap } from './types.js';
import { invokeModel } from '../api/services/llm.js';

type DocumentationInput = {
  codeMap: CodeMap;
  intentContent: string;
};

type DocumentationOutput = {
  docPath: string;
  dataflowPath: string;
};

const DOC_SYSTEM_PROMPT = `You are a technical documentation expert. Given a structured code map and intent document from legacy code, generate comprehensive living documentation.

Your output MUST be in Markdown and include:
1. ## Module Overview — what this code does at a business level
2. ## Functions — each function with parameters, return value, purpose, and any risks
3. ## Known Risks — legacy patterns, security issues, technical debt
4. ## Legacy Patterns Identified — antipatterns found in the code

Be thorough but concise. Use clear headings.`;

const DATAFLOW_SYSTEM_PROMPT = `You are a software architect. Generate a Mermaid flowchart TD diagram showing the data flow between functions.

Rules:
- Use valid Mermaid flowchart TD syntax ONLY
- Each node should be a function or data store
- Use --> for data flow, -.-> for optional/conditional flow
- Include database nodes where DB calls exist
- Return ONLY the raw Mermaid diagram code, starting with "flowchart TD", no markdown fences`;

export class DocumentationAgent implements Agent<DocumentationInput, DocumentationOutput> {
  name = 'DocumentationAgent';
  description = 'Generates living documentation and data flow diagrams from the code map';

  async run(
    input: DocumentationInput,
    context: AgentContext
  ): Promise<AgentResult<DocumentationOutput>> {
    const start = Date.now();
    const outputDir = path.join(context.outputDir, 'docs');

    try {
      context.onProgress('Starting documentation generation...', 0);
      await fs.mkdir(outputDir, { recursive: true });

      const codeMapSummary = JSON.stringify(input.codeMap, null, 2);
      const docPrompt = `Based on this code map and intent document, generate comprehensive documentation.

CODE MAP:
\`\`\`json
${codeMapSummary}
\`\`\`

INTENT DOCUMENT:
${input.intentContent.slice(0, 3000)}`;

      context.onProgress('Generating module documentation...', 50);

      const docResult = await invokeModel({
        messages: [{ role: 'user', content: docPrompt }],
        system: DOC_SYSTEM_PROMPT,
        temperature: 0.4,
        maxTokens: 4096
      });

      const dataflowPrompt = `Generate a Mermaid data flow diagram for this code:

Functions: ${input.codeMap.functions.map((f) => f.name).join(', ')}
DB Calls: ${input.codeMap.dbCalls.join(', ') || 'none'}
Side Effects: ${input.codeMap.sideEffects.join(', ') || 'none'}`;

      const dataflowResult = await invokeModel({
        messages: [{ role: 'user', content: dataflowPrompt }],
        system: DATAFLOW_SYSTEM_PROMPT,
        temperature: 0.4,
        maxTokens: 1024
      });

      // Clean up dataflow — strip any accidental fences and normalize graph syntax
      let mermaid = dataflowResult.content.trim();
      const fenceMatch = mermaid.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
      if (fenceMatch) {
        mermaid = fenceMatch[1].trim();
      }
      mermaid = mermaid.replace(/^graph\s+(TD|TB|LR|RL|BT)\b/i, 'flowchart $1');
      if (!mermaid.startsWith('flowchart')) {
        throw new Error('LLM did not return a valid Mermaid flowchart diagram');
      }

      const docPath = path.join(outputDir, 'documentation.md');
      const dataflowPath = path.join(outputDir, 'dataflow.mmd');

      await fs.writeFile(docPath, docResult.content, 'utf-8');
      await fs.writeFile(dataflowPath, mermaid, 'utf-8');

      context.onProgress('Documentation complete', 100);

      return {
        success: true,
        output: { docPath, dataflowPath },
        durationMs: Date.now() - start
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, durationMs: Date.now() - start };
    }
  }
}
