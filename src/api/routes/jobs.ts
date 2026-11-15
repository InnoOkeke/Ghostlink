import { Router } from 'express';
import multer from 'multer';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const archiver = _require('archiver') as (
  format: string,
  options?: Record<string, unknown>
) => import('archiver').Archiver;
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import {
  createJob,
  getJob,
  subscribeToJob,
  getAllJobs,
  resetStepsFrom,
  setJobGithubResult
} from '../services/job-store.js';
import { runPipeline } from '../../agents/pipeline.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { detectLanguageFromFilename } from '../../parser/legacy-parser.js';
import { pushJobOutputToGithub } from '../../mcp/github-mcp.js';

export const jobsRouter = Router();

const jobCreationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: Number(process.env.RATE_LIMIT_MAX_JOBS || 15),
  message: 'Rate limit exceeded: maximum 15 modernization jobs per 15 minutes per IP.'
});

const githubPushLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: Number(process.env.RATE_LIMIT_MAX_GITHUB || 10),
  message: 'Rate limit exceeded: maximum 10 GitHub pushes per 15 minutes per IP.'
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 } // 500KB per file
});

const fileSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  language: z.string().min(1)
});

const createJobSchema = z.object({
  files: z.array(fileSchema).min(1).max(10),
  targetStack: z.enum(['typescript', 'python', 'go']),
  pushToGithub: z.boolean().optional(),
  githubRepo: z.string().optional()
});

const pushGithubSchema = z.object({
  repoName: z.string().optional(),
  githubToken: z.string().optional()
});

const OUTPUT_BASE = path.join(process.cwd(), 'outputs');
const SAMPLES_DIR = path.join(process.cwd(), 'examples', 'legacy-samples');

export interface ArtifactItem {
  filename: string;
  relativePath: string;
  language: string;
  content: string;
}

function isValidJobId(id: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(id);
}

function detectHighlightLanguage(filename: string): string {
  const base = path.basename(filename).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';

  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.md': 'markdown',
    '.json': 'json',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.mmd': 'plaintext',
    '.php': 'php',
    '.asp': 'vbscript',
    '.bas': 'vbnet',
    '.vb': 'vbnet',
    '.cls': 'vbnet',
    '.frm': 'vbnet',
    '.cbl': 'cobol',
    '.cob': 'cobol',
    '.cpy': 'cobol',
    '.pas': 'delphi',
    '.dpr': 'delphi',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.f': 'fortran',
    '.for': 'fortran',
    '.f77': 'fortran',
    '.f90': 'fortran',
    '.f95': 'fortran',
    '.pl': 'perl',
    '.pm': 'perl'
  };
  return map[ext] ?? 'plaintext';
}

async function readArtifactsDir(
  dirPath: string,
  baseDir: string
): Promise<ArtifactItem[]> {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
  const items: ArtifactItem[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await readArtifactsDir(fullPath, baseDir);
      items.push(...nested);
    } else if (entry.isFile()) {
      const content = await fsPromises.readFile(fullPath, 'utf-8');
      const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      items.push({
        filename: entry.name,
        relativePath,
        language: detectHighlightLanguage(entry.name),
        content
      });
    }
  }

  return items;
}

// GET /api/jobs — list all jobs
jobsRouter.get('/', (_req, res) => {
  res.json({ success: true, data: getAllJobs() });
});

// GET /api/jobs/samples — read real legacy samples from examples/legacy-samples/
jobsRouter.get('/samples', async (_req, res) => {
  try {
    if (!fs.existsSync(SAMPLES_DIR)) {
      res.json({ success: true, data: [] });
      return;
    }

    const entries = await fsPromises.readdir(SAMPLES_DIR, { withFileTypes: true });
    const samples = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (entry) => {
          const fullPath = path.join(SAMPLES_DIR, entry.name);
          const content = await fsPromises.readFile(fullPath, 'utf-8');
          return {
            name: entry.name,
            language: detectLanguageFromFilename(entry.name, content),
            content
          };
        })
    );

    res.json({ success: true, data: samples });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load samples';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/jobs — create a new job (JSON body)
jobsRouter.post('/', jobCreationLimiter, validate(createJobSchema), (req, res) => {
  const input = req.body as z.infer<typeof createJobSchema>;
  const job = createJob(input);

  runPipeline(job.jobId, input, OUTPUT_BASE).catch((err: unknown) => {
    console.error(`Pipeline error for job ${job.jobId}:`, err);
  });

  res.status(202).json({ success: true, data: { jobId: job.jobId } });
});

// POST /api/jobs/upload — multipart file upload
jobsRouter.post(
  '/upload',
  jobCreationLimiter,
  upload.array('files', 10),
  (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded' });
      return;
    }

    const reqBody = req.body as Record<string, string>;
    const targetStack = reqBody.targetStack as
      | 'typescript'
      | 'python'
      | 'go';
    if (!['typescript', 'python', 'go'].includes(targetStack)) {
      res.status(400).json({ success: false, error: 'Invalid targetStack' });
      return;
    }

    const selectedLang = (reqBody.sourceLanguage ?? '').trim().toLowerCase();
    const mappedFiles = files.map((f) => {
      const content = f.buffer.toString('utf-8');
      const detected = detectLanguageFromFilename(f.originalname, content);
      const language =
        detected || (selectedLang && selectedLang !== 'auto' ? selectedLang : '');
      return {
        name: f.originalname,
        content,
        language
      };
    });

    const unresolved = mappedFiles.find((f) => !f.language);
    if (unresolved) {
      res.status(400).json({
        success: false,
        error: `Could not determine source language for file "${unresolved.name}"`
      });
      return;
    }

    const pushToGithub = reqBody.pushToGithub === 'true';
    const githubRepo = reqBody.githubRepo;

    const input = { files: mappedFiles, targetStack, pushToGithub, githubRepo };
    const job = createJob(input);

    runPipeline(job.jobId, input, OUTPUT_BASE).catch((err: unknown) => {
      console.error(`Pipeline error for job ${job.jobId}:`, err);
    });

    res.status(202).json({ success: true, data: { jobId: job.jobId } });
  }
);

// GET /api/jobs/:id — get job status
jobsRouter.get('/:id', (req, res) => {
  if (!isValidJobId(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid job ID' });
    return;
  }

  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }
  res.json({ success: true, data: job });
});

// GET /api/jobs/:id/artifacts — get real generated artifacts from disk
jobsRouter.get('/:id/artifacts', async (req, res) => {
  if (!isValidJobId(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid job ID' });
    return;
  }

  const job = getJob(req.params.id);
  const outputDir = path.join(OUTPUT_BASE, req.params.id);

  if (!job && !fs.existsSync(outputDir)) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  try {
    const [archaeology, documentation, modernized, tests, deploy] = await Promise.all([
      readArtifactsDir(path.join(outputDir, 'archaeology'), outputDir),
      readArtifactsDir(path.join(outputDir, 'docs'), outputDir),
      readArtifactsDir(path.join(outputDir, 'modernized'), outputDir),
      readArtifactsDir(path.join(outputDir, 'tests'), outputDir),
      readArtifactsDir(path.join(outputDir, 'deploy'), outputDir)
    ]);

    const original: ArtifactItem[] = (job?.input?.files ?? []).map((f) => ({
      filename: f.name,
      relativePath: `original/${f.name}`,
      language: detectHighlightLanguage(f.name),
      content: f.content
    }));

    res.json({
      success: true,
      data: {
        archaeology,
        documentation,
        modernized,
        tests,
        deploy,
        original
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read job artifacts';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/jobs/:id/push-github — push generated output to GitHub via MCP
jobsRouter.post(
  '/:id/push-github',
  githubPushLimiter,
  validate(pushGithubSchema),
  async (req, res) => {
    const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!jobId || !isValidJobId(jobId)) {
      res.status(400).json({ success: false, error: 'Invalid job ID' });
      return;
    }

    const job = getJob(jobId);
    const outputDir = path.join(OUTPUT_BASE, jobId);

    if (!job || !fs.existsSync(outputDir)) {
      res.status(404).json({ success: false, error: 'Job or output directory not found' });
      return;
    }

    const body = req.body as z.infer<typeof pushGithubSchema>;
    const shortId = job.jobId.slice(0, 8);
    const defaultProjectName = job.input?.files[0]?.name
      ? path
          .basename(job.input.files[0].name, path.extname(job.input.files[0].name))
          .replace(/[^a-zA-Z0-9._-]/g, '-')
      : 'ghostlink';

    const repoName =
      body.repoName?.trim() ||
      job.input?.githubRepo?.trim() ||
      `${defaultProjectName}-modernized-${shortId}`;

    try {
      const result = await pushJobOutputToGithub(outputDir, repoName, body.githubToken);
      setJobGithubResult(job.jobId, result);
      res.json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  }
);

// POST /api/jobs/:id/retry — resume failed job from first non-completed step
jobsRouter.post('/:id/retry', jobCreationLimiter, (req, res) => {
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!jobId || !isValidJobId(jobId)) {
    res.status(400).json({ success: false, error: 'Invalid job ID' });
    return;
  }

  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  if (job.status !== 'failed' || !job.input) {
    res.status(400).json({
      success: false,
      error: 'Only failed jobs with stored input can be retried'
    });
    return;
  }

  const failedStepIndex = job.steps.findIndex((s) => s.status !== 'done');
  if (failedStepIndex < 0) {
    res.status(400).json({ success: false, error: 'No failed steps found to retry' });
    return;
  }

  resetStepsFrom(job.jobId, failedStepIndex);

  runPipeline(job.jobId, job.input, OUTPUT_BASE, failedStepIndex).catch((err: unknown) => {
    console.error(`Retry pipeline error for job ${job.jobId}:`, err);
  });

  res.status(202).json({
    success: true,
    data: { jobId: job.jobId, resumedFromStep: failedStepIndex }
  });
});

// GET /api/jobs/:id/stream — SSE
jobsRouter.get('/:id/stream', (req, res) => {
  if (!isValidJobId(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid job ID' });
    return;
  }

  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const currentJob = getJob(req.params.id);
  res.write(`data: ${JSON.stringify({ type: 'snapshot', job: currentJob })}\n\n`);

  const unsubscribe = subscribeToJob(req.params.id, (event) => {
    res.write(`data: ${event}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

// GET /api/jobs/:id/download — ZIP download
jobsRouter.get('/:id/download', (req, res) => {
  if (!isValidJobId(req.params.id)) {
    res.status(400).json({ success: false, error: 'Invalid job ID' });
    return;
  }

  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  const outputDir = path.join(OUTPUT_BASE, req.params.id);
  if (!fs.existsSync(outputDir)) {
    res.status(404).json({ success: false, error: 'Output directory not found' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="ghostlink-${req.params.id}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err: Error) => {
    console.error('Archive error:', err);
    res.status(500).end();
  });

  archive.pipe(res);
  archive.directory(outputDir, false);
  archive.finalize().catch(console.error);
});
