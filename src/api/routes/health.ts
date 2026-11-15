import { Router } from 'express';
import { getEnvConfig } from '../services/env.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const config = getEnvConfig();

  res.json({
    success: true,
    data: {
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      config: {
        llmProvider: config.activeLlmProvider,
        llmConfigured: config.activeLlmProvider !== 'none',
        githubConfigured: config.hasGithubCredentials
      }
    }
  });
});
