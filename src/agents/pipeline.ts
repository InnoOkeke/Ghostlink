import fs from 'fs/promises';
import path from 'path';
import type { Agent, AgentContext, AgentResult, CodeMap, LegacyCodeInput } from './types.js';
import { ArchaeologyAgent } from './archaeology-agent.js';
import { DocumentationAgent } from './documentation-agent.js';
import { ModernizerAgent } from './modernizer-agent.js';
import { TestAgent } from './test-agent.js';
import { DeployAgent } from './deploy-agent.js';
import {
  updateJobStatus,
  updateStepStatus,
  emitJobEvent,
  getJob,
  setJobGithubResult,
  setJobGithubError
} from '../api/services/job-store.js';
import { pushJobOutputToGithub } from '../mcp/github-mcp.js';

const RETRY_DELAY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry<TIn, TOut>(
  agent: Agent<TIn, TOut>,
  input: TIn,
  context: AgentContext
): Promise<AgentResult<TOut>> {
  let result = await agent.run(input, context);
  if (!result.success) {
    context.onProgress(
      `Retrying ${agent.name} after error: ${result.error ?? 'Unknown error'}`,
      0
    );
    await sleep(RETRY_DELAY_MS);
    result = await agent.run(input, context);
  }
  return result;
}

function failStep(jobId: string, stepName: string, errorMessage: string): void {
  updateStepStatus(jobId, stepName, {
    status: 'error',
    message: errorMessage
  });
  updateJobStatus(jobId, 'failed', errorMessage);
  emitJobEvent(
    jobId,
    JSON.stringify({
      type: 'pipeline:error',
      step: stepName,
      error: errorMessage,
      message: errorMessage
    })
  );
}

async function loadArchaeologyFromDisk(
  outputDir: string
): Promise<{ codeMap: CodeMap; intentContent: string }> {
  const codeMapPath = path.join(outputDir, 'archaeology', 'code-map.json');
  const intentPath = path.join(outputDir, 'archaeology', 'intent.md');
  const rawCodeMap = await fs.readFile(codeMapPath, 'utf-8');
  const codeMap = JSON.parse(rawCodeMap) as CodeMap;
  const intentContent = await fs.readFile(intentPath, 'utf-8');
  return { codeMap, intentContent };
}

async function loadModernizedFilesFromDisk(outputDir: string): Promise<string[]> {
  const modernizedDir = path.join(outputDir, 'modernized');
  const entries = await fs.readdir(modernizedDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== 'decisions.md')
    .map((entry) => path.join(modernizedDir, entry.name));
}

/**
 * Runs the 5-agent modernization pipeline, optionally resuming from a specific step index (0-4).
 */
export async function runPipeline(
  jobId: string,
  input: LegacyCodeInput,
  outputBase: string,
  startFromStepIndex = 0
): Promise<void> {
  const outputDir = path.join(outputBase, jobId);
  await fs.mkdir(outputDir, { recursive: true });

  const makeContext = (stepName: string): AgentContext => ({
    jobId,
    outputDir,
    onProgress: (message: string, percent: number) => {
      updateStepStatus(jobId, stepName, { progress: percent, message });
      const job = getJob(jobId);
      emitJobEvent(
        jobId,
        JSON.stringify({
          type: 'progress',
          step: stepName,
          message,
          percent,
          jobStatus: job?.status
        })
      );
    }
  });

  updateJobStatus(jobId, 'running');
  emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:start', jobId, startFromStepIndex }));

  let codeMap: CodeMap;
  let intentContent: string;

  // ── Step 0: Archaeology ──────────────────────────────────────────────────
  if (startFromStepIndex <= 0) {
    const archaeologyAgent = new ArchaeologyAgent();
    updateStepStatus(jobId, 'ArchaeologyAgent', { status: 'running' });

    const archaeologyResult = await runWithRetry(
      archaeologyAgent,
      input,
      makeContext('ArchaeologyAgent')
    );

    if (!archaeologyResult.success || !archaeologyResult.output) {
      failStep(jobId, 'ArchaeologyAgent', archaeologyResult.error ?? 'Unknown error');
      return;
    }

    updateStepStatus(jobId, 'ArchaeologyAgent', {
      status: 'done',
      progress: 100,
      message: 'Archaeology complete'
    });
    emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'ArchaeologyAgent' }));

    codeMap = archaeologyResult.output.codeMap;
    try {
      intentContent = await fs.readFile(archaeologyResult.output.intentPath, 'utf-8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failStep(jobId, 'ArchaeologyAgent', `Failed to read intent document: ${msg}`);
      return;
    }
  } else {
    try {
      const loaded = await loadArchaeologyFromDisk(outputDir);
      codeMap = loaded.codeMap;
      intentContent = loaded.intentContent;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failStep(
        jobId,
        'ArchaeologyAgent',
        `Cannot resume pipeline: missing archaeology outputs (${msg})`
      );
      return;
    }
  }

  // ── Step 1: Documentation ────────────────────────────────────────────────
  if (startFromStepIndex <= 1) {
    const documentationAgent = new DocumentationAgent();
    updateStepStatus(jobId, 'DocumentationAgent', { status: 'running' });

    const documentationResult = await runWithRetry(
      documentationAgent,
      { codeMap, intentContent },
      makeContext('DocumentationAgent')
    );

    if (!documentationResult.success) {
      failStep(jobId, 'DocumentationAgent', documentationResult.error ?? 'Unknown error');
      return;
    }

    updateStepStatus(jobId, 'DocumentationAgent', {
      status: 'done',
      progress: 100,
      message: 'Documentation complete'
    });
    emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'DocumentationAgent' }));
  }

  // ── Step 2: Modernizer ───────────────────────────────────────────────────
  let modernizedFiles: string[];
  if (startFromStepIndex <= 2) {
    const modernizerAgent = new ModernizerAgent();
    updateStepStatus(jobId, 'ModernizerAgent', { status: 'running' });

    const modernizerResult = await runWithRetry(
      modernizerAgent,
      { files: input.files, codeMap, targetStack: input.targetStack },
      makeContext('ModernizerAgent')
    );

    if (!modernizerResult.success || !modernizerResult.output) {
      failStep(jobId, 'ModernizerAgent', modernizerResult.error ?? 'Unknown error');
      return;
    }

    updateStepStatus(jobId, 'ModernizerAgent', {
      status: 'done',
      progress: 100,
      message: 'Modernization complete'
    });
    emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'ModernizerAgent' }));

    modernizedFiles = modernizerResult.output.modernizedFiles;
  } else {
    try {
      modernizedFiles = await loadModernizedFilesFromDisk(outputDir);
      if (modernizedFiles.length === 0) {
        throw new Error('No modernized files found on disk');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failStep(jobId, 'ModernizerAgent', `Cannot resume pipeline: ${msg}`);
      return;
    }
  }

  // ── Step 3: Test Agent ───────────────────────────────────────────────────
  if (startFromStepIndex <= 3) {
    const testAgent = new TestAgent();
    updateStepStatus(jobId, 'TestAgent', { status: 'running' });

    const testResult = await runWithRetry(
      testAgent,
      { modernizedFiles, codeMap, targetStack: input.targetStack },
      makeContext('TestAgent')
    );

    if (!testResult.success) {
      failStep(jobId, 'TestAgent', testResult.error ?? 'Unknown error');
      return;
    }

    updateStepStatus(jobId, 'TestAgent', {
      status: 'done',
      progress: 100,
      message: 'Tests generated'
    });
    emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'TestAgent' }));
  }

  // ── Step 4: Deploy Agent ─────────────────────────────────────────────────
  const projectName = input.files[0]?.name
    ? path.basename(input.files[0].name, path.extname(input.files[0].name))
    : 'modernized-project';

  if (startFromStepIndex <= 4) {
    const deployAgent = new DeployAgent();
    updateStepStatus(jobId, 'DeployAgent', { status: 'running' });

    const deployResult = await runWithRetry(
      deployAgent,
      { targetStack: input.targetStack, projectName, codeMap, modernizedFiles },
      makeContext('DeployAgent')
    );

    if (!deployResult.success) {
      failStep(jobId, 'DeployAgent', deployResult.error ?? 'Unknown error');
      return;
    }

    updateStepStatus(jobId, 'DeployAgent', {
      status: 'done',
      progress: 100,
      message: 'Deploy scaffold complete'
    });
    emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'DeployAgent' }));
  }

  // ── Optional Step: GitHub MCP Integration ────────────────────────────────
  if (input.pushToGithub) {
    const shortId = jobId.slice(0, 8);
    const sanitizedProject = projectName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const repoName = input.githubRepo?.trim() || `${sanitizedProject}-modernized-${shortId}`;
    emitJobEvent(
      jobId,
      JSON.stringify({
        type: 'step:github',
        status: 'running',
        message: `Pushing modernized files to GitHub repo "${repoName}" via MCP...`
      })
    );

    try {
      const githubResult = await pushJobOutputToGithub(outputDir, repoName);
      setJobGithubResult(jobId, githubResult);
      emitJobEvent(
        jobId,
        JSON.stringify({
          type: 'step:github',
          status: 'done',
          githubResult
        })
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setJobGithubError(jobId, error);
      emitJobEvent(
        jobId,
        JSON.stringify({
          type: 'github:error',
          error
        })
      );
    }
  }

  // ── Pipeline Complete ────────────────────────────────────────────────────
  updateJobStatus(jobId, 'completed');
  emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:complete', jobId }));
}
