import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { jobsRouter } from './routes/jobs.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/jobs', jobsRouter);
app.use('/api/health', healthRouter);

app.use(errorHandler);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`GhostLink API running on port ${PORT}`));

export default app;
