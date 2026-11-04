import { v4 as uuidv4 } from 'uuid';
import type { JobStatus, LegacyCodeInput, StepStatus } from '../../agents/types.js';

const jobs = new Map<string, JobStatus>();
const listeners = new Map<string, Set<(event: string) => void>>();

const STEP_NAMES = [
  'ArchaeologyAgent',
  'DocumentationAgent',
  'ModernizerAgent',
  'TestAgent',
  'DeployAgent'
];

export function createJob(input: LegacyCodeInput): JobStatus {
  const jobId = uuidv4();
  const job: JobStatus = {
    jobId,
    status: 'pending',
    steps: STEP_NAMES.map((name) => ({
      name,
      status: 'pending',
      progress: 0,
      message: 'Waiting to start...'
    })),
    createdAt: new Date().toISOString(),
    outputDir: `outputs/${jobId}`,
    input
  };
  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): JobStatus | undefined {
  return jobs.get(jobId);
}

export function updateJobStatus(jobId: string, status: JobStatus['status']): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = status;
  if (status === 'completed' || status === 'failed') {
    job.completedAt = new Date().toISOString();
  }
  jobs.set(jobId, job);
}

export function updateStepStatus(
  jobId: string,
  stepName: string,
  update: Partial<StepStatus>
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  const step = job.steps.find((s) => s.name === stepName);
  if (!step) return;
  Object.assign(step, update);
  if (update.status === 'running' && !step.startedAt) {
    step.startedAt = new Date().toISOString();
  }
  if (update.status === 'done' || update.status === 'error') {
    step.completedAt = new Date().toISOString();
  }
  jobs.set(jobId, job);
}

export function subscribeToJob(
  jobId: string,
  listener: (event: string) => void
): () => void {
  if (!listeners.has(jobId)) {
    listeners.set(jobId, new Set());
  }
  listeners.get(jobId)!.add(listener);
  return () => {
    listeners.get(jobId)?.delete(listener);
  };
}

export function emitJobEvent(jobId: string, event: string): void {
  listeners.get(jobId)?.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  });
}

export function getAllJobs(): JobStatus[] {
  return Array.from(jobs.values());
}
