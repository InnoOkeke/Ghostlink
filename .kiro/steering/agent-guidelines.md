---
inclusion: always
---

# Agent Development Guidelines

## Agent Interface
Every agent in GhostLink must implement this interface (defined in `src/agents/types.ts`):

```typescript
interface Agent<TInput, TOutput> {
  name: string;
  description: string;
  run(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

interface AgentContext {
  jobId: string;
  outputDir: string;
  onProgress: (message: string, percent: number) => void;
}

interface AgentResult<T> {
  success: boolean;
  output?: T;
  error?: string;
  durationMs: number;
}
```

## Agent Behavior Rules
1. Each agent MUST emit progress events via `context.onProgress` at regular intervals
2. Each agent MUST save its output to `context.outputDir` before returning
3. Each agent MUST be independently runnable — no hidden dependencies on prior agent state beyond the output files
4. Agents MUST NOT make direct LLM calls — use the shared `llm` service from `src/api/services/llm.ts`
5. Agents MUST handle and log errors gracefully; never crash the pipeline silently

## LLM Prompt Guidelines
- System prompts must specify the agent's role, constraints, and output format (always JSON or Markdown with explicit schema)
- Temperature: 0.2 for code generation, 0.4 for documentation
- Always include the input language and target language in the prompt context
- Always request structured JSON output where possible; parse and validate before returning

## Output File Naming
- Archaeology: `<jobId>/archaeology/code-map.json`, `<jobId>/archaeology/intent.md`
- Documentation: `<jobId>/docs/documentation.md`, `<jobId>/docs/dataflow.mmd`
- Modernizer: `<jobId>/modernized/<files>`, `<jobId>/modernized/decisions.md`
- Tests: `<jobId>/tests/<test-files>`
- Deploy: `<jobId>/deploy/Dockerfile`, `<jobId>/deploy/docker-compose.yml`, `<jobId>/deploy/.github/workflows/ci.yml`
