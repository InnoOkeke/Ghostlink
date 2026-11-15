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

const defaultCodeMap = {
  functions: [
    {
      name: 'testFn',
      signature: 'testFn()',
      lineStart: 1,
      lineEnd: 5,
      description: 'Test function'
    }
  ],
  globals: [],
  sideEffects: [],
  dbCalls: [],
  externalDeps: [],
  businessRules: ['Always validate input']
};

// ── Hoisted Mock Functions ──────────────────────────────────────────────────

const { archaeologyRunMock, documentationRunMock, readFileMock } = vi.hoisted(() => ({
  archaeologyRunMock: vi.fn(),
  documentationRunMock: vi.fn(),
  readFileMock: vi.fn()
}));

// ── Mock Agents & Services ──────────────────────────────────────────────────

vi.mock('../src/agents/archaeology-agent.js', () => ({
  ArchaeologyAgent: class {
    name = 'ArchaeologyAgent';
    description = 'Mock archaeology agent';
    run = archaeologyRunMock;
  }
}));

vi.mock('../src/agents/documentation-agent.js', () => ({
  DocumentationAgent: class {
    name = 'DocumentationAgent';
    description = 'Mock documentation agent';
    run = documentationRunMock;
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
  getJob: vi.fn(() => ({ status: 'running', steps: [] })),
  setJobGithubResult: vi.fn(),
  setJobGithubError: vi.fn()
}));

vi.mock('../src/mcp/github-mcp.js', () => ({
  pushJobOutputToGithub: vi.fn(async () => ({
    repoUrl: 'https://github.com/example/repo',
    prUrl: 'https://github.com/example/repo/pull/1'
  }))
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(async () => undefined),
    readFile: readFileMock,
    writeFile: vi.fn(async () => undefined),
    readdir: vi.fn(async () => [])
  },
  mkdir: vi.fn(async () => undefined),
  readFile: readFileMock,
  writeFile: vi.fn(async () => undefined),
  readdir: vi.fn(async () => [])
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
    archaeologyRunMock.mockImplementation(async () =>
      successResult({
        codeMap: defaultCodeMap,
        intentPath: '/tmp/test-output/archaeology/intent.md',
        codeMapPath: '/tmp/test-output/archaeology/code-map.json'
      })
    );
    documentationRunMock.mockImplementation(async () =>
      successResult({
        docPath: '/tmp/test-output/docs/documentation.md',
        dataflowPath: '/tmp/test-output/docs/dataflow.mmd'
      })
    );
    readFileMock.mockImplementation(async () => '# intent content');
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

  it('retries a failed agent once and completes when retry succeeds', async () => {
    archaeologyRunMock.mockResolvedValueOnce(failureResult('Transient Bedrock timeout'));

    const { runPipeline } = await import('../src/agents/pipeline.js');
    const { updateJobStatus } = await import('../src/api/services/job-store.js');

    await runPipeline('job-retry-success', mockInput, '/tmp/outputs');

    expect(archaeologyRunMock).toHaveBeenCalledTimes(2);
    expect(updateJobStatus).toHaveBeenCalledWith('job-retry-success', 'completed');
  });

  it('marks job failed with error message when an agent fails both attempts', async () => {
    documentationRunMock
      .mockResolvedValueOnce(failureResult('LLM credentials missing'))
      .mockResolvedValueOnce(failureResult('LLM credentials missing'));

    const { runPipeline } = await import('../src/agents/pipeline.js');
    const { updateJobStatus, emitJobEvent } = await import('../src/api/services/job-store.js');

    await runPipeline('job-fail-both', mockInput, '/tmp/outputs');

    expect(documentationRunMock).toHaveBeenCalledTimes(2);
    expect(updateJobStatus).toHaveBeenCalledWith(
      'job-fail-both',
      'failed',
      'LLM credentials missing'
    );

    const calls = (emitJobEvent as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const errorEvent = calls.find(([, event]) => event.includes('pipeline:error'));
    expect(errorEvent).toBeTruthy();
    expect(errorEvent?.[1]).toContain('DocumentationAgent');
  });

  it('resumes from a later step by loading prior artifacts from disk', async () => {
    readFileMock
      .mockResolvedValueOnce(JSON.stringify(defaultCodeMap))
      .mockResolvedValueOnce('# loaded intent');

    const { runPipeline } = await import('../src/agents/pipeline.js');
    const { updateJobStatus } = await import('../src/api/services/job-store.js');

    await runPipeline('job-resume', mockInput, '/tmp/outputs', 2);

    expect(archaeologyRunMock).not.toHaveBeenCalled();
    expect(documentationRunMock).not.toHaveBeenCalled();
    expect(updateJobStatus).toHaveBeenCalledWith('job-resume', 'completed');
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

describe('createRateLimiter', () => {
  it('allows requests up to maxRequests and blocks subsequent requests with 429', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevForce = process.env.FORCE_RATE_LIMIT;
    process.env.FORCE_RATE_LIMIT = 'true';

    try {
      const { createRateLimiter } = await import('../src/api/middleware/rate-limit.js');
      const limiter = createRateLimiter({
        windowMs: 60_000,
        maxRequests: 2,
        message: 'Too many requests test'
      });

      const invoke = () => {
        const headers: Record<string, string> = {};
        let statusCode = 200;
        let jsonBody: unknown = null;
        let nextCalled = false;

        const req = { ip: '127.0.0.99', socket: { remoteAddress: '127.0.0.99' } } as never;
        const res = {
          setHeader: (k: string, v: string) => {
            headers[k] = v;
          },
          status: (code: number) => {
            statusCode = code;
            return res;
          },
          json: (body: unknown) => {
            jsonBody = body;
            return res;
          }
        } as never;

        limiter(req, res, () => {
          nextCalled = true;
        });

        return { headers, statusCode, jsonBody, nextCalled };
      };

      const first = invoke();
      expect(first.nextCalled).toBe(true);
      expect(first.headers['X-RateLimit-Remaining']).toBe('1');

      const second = invoke();
      expect(second.nextCalled).toBe(true);
      expect(second.headers['X-RateLimit-Remaining']).toBe('0');

      const third = invoke();
      expect(third.nextCalled).toBe(false);
      expect(third.statusCode).toBe(429);
      expect(third.headers['Retry-After']).toBeTruthy();
      expect(third.jsonBody).toEqual({
        success: false,
        error: 'Too many requests test'
      });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevForce === undefined) {
        delete process.env.FORCE_RATE_LIMIT;
      } else {
        process.env.FORCE_RATE_LIMIT = prevForce;
      }
    }
  });
});
