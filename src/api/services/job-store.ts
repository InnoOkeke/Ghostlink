import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
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

function getOutputsRoot(): string {
  return path.join(process.cwd(), 'outputs');
}

function getJobFilePath(jobId: string): string {
  return path.join(getOutputsRoot(), jobId, 'job.json');
}

async function persistJob(job: JobStatus): Promise<void> {
  try {
    const dir = path.join(getOutputsRoot(), job.jobId);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(getJobFilePath(job.jobId), JSON.stringify(job, null, 2), 'utf-8');
  } catch {
    // Ignore filesystem errors in test environments
  }
}

function loadJobFromDisk(jobId: string): JobStatus | undefined {
  try {
    const filePath = getJobFilePath(jobId);
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as JobStatus;
    if (parsed && parsed.jobId) {
      jobs.set(parsed.jobId, parsed);
      return parsed;
    }
  } catch {
    // Ignore malformed or unreadable persisted job files
  }
  return undefined;
}

function loadAllJobsFromDisk(): void {
  try {
    const root = getOutputsRoot();
    if (!fs.existsSync(root)) {
      return;
    }
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !jobs.has(entry.name)) {
        loadJobFromDisk(entry.name);
      }
    }
  } catch {
    // Ignore disk scan errors
  }
}

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
  void persistJob(job);
  return job;
}

export function getJob(jobId: string): JobStatus | undefined {
  return jobs.get(jobId) ?? loadJobFromDisk(jobId);
}

export function updateJobStatus(
  jobId: string,
  status: JobStatus['status'],
  error?: string
): void {
  const job = getJob(jobId);
  if (!job) return;
  job.status = status;
  if (status === 'running') {
    delete job.error;
    delete job.completedAt;
  } else if (status === 'failed') {
    job.completedAt = new Date().toISOString();
    if (error !== undefined) {
      job.error = error;
    }
  } else if (status === 'completed') {
    job.completedAt = new Date().toISOString();
    delete job.error;
  }
  jobs.set(jobId, job);
  void persistJob(job);
}

export function updateStepStatus(
  jobId: string,
  stepName: string,
  update: Partial<StepStatus>
): void {
  const job = getJob(jobId);
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
  void persistJob(job);
}

export function resetStepsFrom(jobId: string, startStepIndex: number): void {
  const job = getJob(jobId);
  if (!job) return;
  for (let i = startStepIndex; i < job.steps.length; i++) {
    const step = job.steps[i];
    job.steps[i] = {
      name: step.name,
      status: 'pending',
      progress: 0,
      message: 'Waiting to retry...'
    };
  }
  job.status = 'running';
  delete job.error;
  delete job.completedAt;
  jobs.set(jobId, job);
  void persistJob(job);
}

export function setJobGithubResult(
  jobId: string,
  githubResult: { repoUrl: string; prUrl: string }
): void {
  const job = getJob(jobId);
  if (!job) return;
  job.githubResult = githubResult;
  delete job.githubError;
  jobs.set(jobId, job);
  void persistJob(job);
}

export function setJobGithubError(jobId: string, githubError: string): void {
  const job = getJob(jobId);
  if (!job) return;
  job.githubError = githubError;
  jobs.set(jobId, job);
  void persistJob(job);
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
  loadAllJobsFromDisk();
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
