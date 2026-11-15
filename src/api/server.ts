import './services/env.js';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { jobsRouter } from './routes/jobs.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/error-handler.js';
import { getEnvConfig } from './services/env.js';

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/jobs', jobsRouter);
app.use('/api/health', healthRouter);

const uiDistPath = path.join(process.cwd(), 'dist', 'ui');
const uiIndexPath = path.join(uiDistPath, 'index.html');

if (fs.existsSync(uiDistPath)) {
  app.use(express.static(uiDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && fs.existsSync(uiIndexPath)) {
      res.sendFile(uiIndexPath);
      return;
    }
    next();
  });
}

app.use(errorHandler);

const { port } = getEnvConfig();
app.listen(port, '0.0.0.0', () => console.log(`GhostLink API running on port ${port}`));

export default app;
