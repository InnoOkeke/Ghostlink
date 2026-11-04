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
import path from 'path';
import { z } from 'zod';
import {
  createJob,
  getJob,
  subscribeToJob,
  getAllJobs
} from '../services/job-store.js';
import { runPipeline } from '../../agents/pipeline.js';
import { validate } from '../middleware/validate.js';

export const jobsRouter = Router();

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

const OUTPUT_BASE = path.join(process.cwd(), 'outputs');

// GET /api/jobs — list all jobs
jobsRouter.get('/', (_req, res) => {
  res.json({ success: true, data: getAllJobs() });
});

// POST /api/jobs — create a new job (JSON body)
jobsRouter.post('/', validate(createJobSchema), (req, res) => {
  const input = req.body as z.infer<typeof createJobSchema>;
  const job = createJob(input);

  // Fire-and-forget pipeline
  runPipeline(job.jobId, input, OUTPUT_BASE).catch((err: unknown) => {
    console.error(`Pipeline error for job ${job.jobId}:`, err);
  });

  res.status(202).json({ success: true, data: { jobId: job.jobId } });
});

// POST /api/jobs/upload — multipart file upload
jobsRouter.post(
  '/upload',
  upload.array('files', 10),
  (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded' });
      return;
    }

    const targetStack = (req.body as Record<string, string>).targetStack as 'typescript' | 'python' | 'go';
    if (!['typescript', 'python', 'go'].includes(targetStack)) {
      res.status(400).json({ success: false, error: 'Invalid targetStack' });
      return;
    }

    const mappedFiles = files.map((f) => ({
      name: f.originalname,
      content: f.buffer.toString('utf-8'),
      language: detectLanguage(f.originalname)
    }));

    const pushToGithub = (req.body as Record<string, string>).pushToGithub === 'true';
    const githubRepo = (req.body as Record<string, string>).githubRepo;

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
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }
  res.json({ success: true, data: job });
});

// GET /api/jobs/:id/stream — SSE
jobsRouter.get('/:id/stream', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send current state immediately
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

function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.php': 'php',
    '.asp': 'asp',
    '.bas': 'vb6',
    '.vb': 'vb6',
    '.cbl': 'cobol',
    '.cob': 'cobol',
    '.pas': 'delphi',
    '.dpr': 'delphi'
  };
  return map[ext] ?? 'unknown';
}
