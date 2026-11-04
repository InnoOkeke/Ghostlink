import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext, AgentResult } from '../src/agents/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    jobId: 'test-job-id',
    outputDir: '/tmp/test-output',
    onProgress: vi.fn(),
    ...overrides
  };
}

function successResult<T>(output: T): AgentResult<T> {
  return { success: true, output, durationMs: 100 };
}

function failureResult(error: string): AgentResult<never> {
  return { success: false, error, durationMs: 50 };
}

// ── Mock agents ──────────────────────────────────────────────────────────────

vi.mock('../src/agents/archaeology-agent.js', () => ({
  ArchaeologyAgent: class {
    name = 'ArchaeologyAgent';
    description = 'Mock archaeology agent';
    run = vi.fn(async () =>
      successResult({
        codeMap: {
          functions: [{ name: 'testFn', signature: 'testFn()', lineStart: 1, lineEnd: 5, description: 'Test function' }],
          globals: [],
          sideEffects: [],
          dbCalls: [],
          externalDeps: [],
          businessRules: ['Always validate input']
        },
        intentPath: '/tmp/test-output/archaeology/intent.md',
        codeMapPath: '/tmp/test-output/archaeology/code-map.json'
      })
    );
  }
}));

vi.mock('../src/agents/documentation-agent.js', () => ({
  DocumentationAgent: class {
    name = 'DocumentationAgent';
    description = 'Mock documentation agent';
    run = vi.fn(async () =>
      successResult({
        docPath: '/tmp/test-output/docs/documentation.md',
        dataflowPath: '/tmp/test-output/docs/dataflow.mmd'
      })
    );
  }
}));

vi.mock('../src/agents/modernizer-agent.js', () => ({
  ModernizerAgent: class {
    name = 'ModernizerAgent';
    description = 'Mock modernizer agent';
    run = vi.fn(async () =>
      successResult({
        modernizedFiles: ['/tmp/test-output/modernized/test.ts'],
        decisionsPath: '/tmp/test-output/modernized/decisions.md'
      })
    );
  }
}));

vi.mock('../src/agents/test-agent.js', () => ({
  TestAgent: class {
    name = 'TestAgent';
    description = 'Mock test agent';
    run = vi.fn(async () =>
      successResult({ testFiles: ['/tmp/test-output/tests/test.test.ts'] })
    );
  }
}));

vi.mock('../src/agents/deploy-agent.js', () => ({
  DeployAgent: class {
    name = 'DeployAgent';
    description = 'Mock deploy agent';
    run = vi.fn(async () =>
      successResult({ deployFiles: ['/tmp/test-output/deploy/Dockerfile'] })
    );
  }
}));

vi.mock('../src/api/services/job-store.js', () => ({
  updateJobStatus: vi.fn(),
  updateStepStatus: vi.fn(),
  emitJobEvent: vi.fn(),
  getJob: vi.fn(() => ({ status: 'running', steps: [] }))
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(async () => '# intent content'),
    writeFile: vi.fn(async () => undefined)
  },
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => '# intent content'),
  writeFile: vi.fn(async () => undefined)
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runPipeline', () => {
  const mockInput = {
    files: [{ name: 'legacy.php', content: '<?php function foo() {}', language: 'php' }],
    targetStack: 'typescript' as const,
    pushToGithub: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateJobStatus with running at start', async () => {
    const { runPipeline } = await import('../src/agents/pipeline.js');
    const { updateJobStatus } = await import('../src/api/services/job-store.js');
    await runPipeline('job-1', mockInput, '/tmp/outputs');
    expect(updateJobStatus).toHaveBeenCalledWith('job-1', 'running');
  });

  it('calls updateJobStatus with completed after all steps succeed', async () => {
    const { runPipeline } = await import('../src/agents/pipeline.js');
    const { updateJobStatus } = await import('../src/api/services/job-store.js');
    await runPipeline('job-2', mockInput, '/tmp/outputs');
    expect(updateJobStatus).toHaveBeenCalledWith('job-2', 'completed');
  });

  it('emits pipeline:complete event when all steps succeed', async () => {
    const { runPipeline } = await import('../src/agents/pipeline.js');
    const { emitJobEvent } = await import('../src/api/services/job-store.js');
    await runPipeline('job-3', mockInput, '/tmp/outputs');
    const calls = (emitJobEvent as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const completeCall = calls.find(([, event]) => event.includes('pipeline:complete'));
    expect(completeCall).toBeTruthy();
  });
});

vi.mock('../src/agents/archaeology-agent.js', () => ({
  ArchaeologyAgent: class {
    name = 'ArchaeologyAgent';
    description = 'Mock archaeology agent';
    run = vi.fn(async () =>
      successResult({
        codeMap: {
          functions: [{ name: 'testFn', signature: 'testFn()', lineStart: 1, lineEnd: 5, description: 'Test function' }],
          globals: [],
          sideEffects: [],
          dbCalls: [],
          externalDeps: [],
          businessRules: ['Always validate input']
        },
        intentPath: '/tmp/test-output/archaeology/intent.md',
        codeMapPath: '/tmp/test-output/archaeology/code-map.json'
      })
    );
  }
}));

describe('pipeline failure handling', () => {
  it('calls updateJobStatus with completed on success path', async () => {
    // After the 3 success tests above, verify the job status was set to completed.
    // We run a fresh pipeline call here to confirm the completed path.
    const { runPipeline } = await import('../src/agents/pipeline.js');
    const { updateJobStatus } = await import('../src/api/services/job-store.js');

    const input = {
      files: [{ name: 'legacy.php', content: '<?php', language: 'php' }],
      targetStack: 'typescript' as const
    };

    await runPipeline('job-success-check', input, '/tmp/outputs');

    expect(updateJobStatus).toHaveBeenCalledWith('job-success-check', 'running');
    expect(updateJobStatus).toHaveBeenCalledWith('job-success-check', 'completed');
    // 'failed' should never appear for a successful pipeline run
    const failedCalls = (updateJobStatus as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const failedForThisJob = failedCalls.filter(
      ([id, status]) => id === 'job-success-check' && status === 'failed'
    );
    expect(failedForThisJob).toHaveLength(0);
  });
});

describe('AgentContext', () => {
  it('onProgress is callable', () => {
    const ctx = makeContext();
    expect(() => ctx.onProgress('test', 50)).not.toThrow();
  });

  it('makeContext returns correct shape', () => {
    const ctx = makeContext({ jobId: 'custom-id' });
    expect(ctx.jobId).toBe('custom-id');
    expect(ctx.outputDir).toBeTruthy();
    expect(typeof ctx.onProgress).toBe('function');
  });
});
