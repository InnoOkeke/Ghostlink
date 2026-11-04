import path from 'path';
import type { LegacyCodeInput, CodeMap } from './types.js';
import { ArchaeologyAgent } from './archaeology-agent.js';
import { DocumentationAgent } from './documentation-agent.js';
import { ModernizerAgent } from './modernizer-agent.js';
import { TestAgent } from './test-agent.js';
import { DeployAgent } from './deploy-agent.js';
import {
  updateJobStatus,
  updateStepStatus,
  emitJobEvent,
  getJob
} from '../api/services/job-store.js';
import fs from 'fs/promises';

const RETRY_DELAY_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry<TIn, TOut>(
  agent: { name: string; run: (input: TIn, ctx: import('./types.js').AgentContext) => Promise<import('./types.js').AgentResult<TOut>> },
  input: TIn,
  context: import('./types.js').AgentContext
): Promise<import('./types.js').AgentResult<TOut>> {
  let result = await agent.run(input, context);
  if (!result.success) {
    await sleep(RETRY_DELAY_MS);
    result = await agent.run(input, context);
  }
  return result;
}

export async function runPipeline(
  jobId: string,
  input: LegacyCodeInput,
  outputBase: string
): Promise<void> {
  const outputDir = path.join(outputBase, jobId);
  await fs.mkdir(outputDir, { recursive: true });

  const makeContext = (stepName: string) => ({
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
  emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:start', jobId }));

  // ── Step 1: Archaeology ──────────────────────────────────────────────────
  const archaeologyAgent = new ArchaeologyAgent();
  updateStepStatus(jobId, 'ArchaeologyAgent', { status: 'running' });

  const archaeologyResult = await runWithRetry(
    archaeologyAgent,
    input,
    makeContext('ArchaeologyAgent')
  );

  if (!archaeologyResult.success || !archaeologyResult.output) {
    updateStepStatus(jobId, 'ArchaeologyAgent', {
      status: 'error',
      message: archaeologyResult.error ?? 'Unknown error'
    });
    updateJobStatus(jobId, 'failed');
    emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:error', step: 'ArchaeologyAgent', error: archaeologyResult.error }));
    return;
  }

  updateStepStatus(jobId, 'ArchaeologyAgent', { status: 'done', progress: 100, message: 'Archaeology complete' });
  emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'ArchaeologyAgent' }));

  const { codeMap } = archaeologyResult.output;

  // Read intent content for documentation agent
  let intentContent = '';
  try {
    intentContent = await fs.readFile(archaeologyResult.output.intentPath, 'utf-8');
  } catch {
    intentContent = 'Intent document not available';
  }

  // ── Step 2: Documentation ────────────────────────────────────────────────
  const documentationAgent = new DocumentationAgent();
  updateStepStatus(jobId, 'DocumentationAgent', { status: 'running' });

  const documentationResult = await runWithRetry(
    documentationAgent,
    { codeMap, intentContent },
    makeContext('DocumentationAgent')
  );

  if (!documentationResult.success) {
    updateStepStatus(jobId, 'DocumentationAgent', {
      status: 'error',
      message: documentationResult.error ?? 'Unknown error'
    });
    updateJobStatus(jobId, 'failed');
    emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:error', step: 'DocumentationAgent', error: documentationResult.error }));
    return;
  }

  updateStepStatus(jobId, 'DocumentationAgent', { status: 'done', progress: 100, message: 'Documentation complete' });
  emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'DocumentationAgent' }));

  // ── Step 3: Modernizer ───────────────────────────────────────────────────
  const modernizerAgent = new ModernizerAgent();
  updateStepStatus(jobId, 'ModernizerAgent', { status: 'running' });

  const modernizerResult = await runWithRetry(
    modernizerAgent,
    { files: input.files, codeMap, targetStack: input.targetStack },
    makeContext('ModernizerAgent')
  );

  if (!modernizerResult.success || !modernizerResult.output) {
    updateStepStatus(jobId, 'ModernizerAgent', {
      status: 'error',
      message: modernizerResult.error ?? 'Unknown error'
    });
    updateJobStatus(jobId, 'failed');
    emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:error', step: 'ModernizerAgent', error: modernizerResult.error }));
    return;
  }

  updateStepStatus(jobId, 'ModernizerAgent', { status: 'done', progress: 100, message: 'Modernization complete' });
  emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'ModernizerAgent' }));

  const { modernizedFiles } = modernizerResult.output;

  // ── Step 4: Test Agent ───────────────────────────────────────────────────
  const testAgent = new TestAgent();
  updateStepStatus(jobId, 'TestAgent', { status: 'running' });

  const testResult = await runWithRetry(
    testAgent,
    { modernizedFiles, codeMap, targetStack: input.targetStack },
    makeContext('TestAgent')
  );

  if (!testResult.success) {
    updateStepStatus(jobId, 'TestAgent', {
      status: 'error',
      message: testResult.error ?? 'Unknown error'
    });
    updateJobStatus(jobId, 'failed');
    emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:error', step: 'TestAgent', error: testResult.error }));
    return;
  }

  updateStepStatus(jobId, 'TestAgent', { status: 'done', progress: 100, message: 'Tests generated' });
  emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'TestAgent' }));

  // ── Step 5: Deploy Agent ─────────────────────────────────────────────────
  const deployAgent = new DeployAgent();
  updateStepStatus(jobId, 'DeployAgent', { status: 'running' });

  const projectName = input.files[0]?.name
    ? path.basename(input.files[0].name, path.extname(input.files[0].name))
    : 'modernized-project';

  const deployResult = await runWithRetry(
    deployAgent,
    { targetStack: input.targetStack, projectName },
    makeContext('DeployAgent')
  );

  if (!deployResult.success) {
    updateStepStatus(jobId, 'DeployAgent', {
      status: 'error',
      message: deployResult.error ?? 'Unknown error'
    });
    updateJobStatus(jobId, 'failed');
    emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:error', step: 'DeployAgent', error: deployResult.error }));
    return;
  }

  updateStepStatus(jobId, 'DeployAgent', { status: 'done', progress: 100, message: 'Deploy scaffold complete' });
  emitJobEvent(jobId, JSON.stringify({ type: 'step:done', step: 'DeployAgent' }));

  // ── Pipeline Complete ────────────────────────────────────────────────────
  updateJobStatus(jobId, 'completed');
  emitJobEvent(jobId, JSON.stringify({ type: 'pipeline:complete', jobId }));
}
