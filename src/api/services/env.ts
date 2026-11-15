import fs from 'fs';
import path from 'path';

export type LlmProvider = 'bedrock' | 'openai' | 'none';

export interface EnvConfig {
  port: number;
  nodeEnv: string;
  maxTokens: number;
  agentTimeoutMs: number;
  awsRegion: string;
  bedrockModelId: string;
  hasBedrockCredentials: boolean;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  hasOpenaiCredentials: boolean;
  githubToken: string;
  githubUsername: string;
  hasGithubCredentials: boolean;
  activeLlmProvider: LlmProvider;
}

const PLACEHOLDER_VALUES = new Set([
  'your_access_key_here',
  'your_secret_key_here',
  'your_openai_key_here',
  'your_deepseek_key_here',
  'your_github_pat_here',
  'your_github_username'
]);

const shellDefinedKeys = new Set(Object.keys(process.env));
const loadedFromEnvKeys = new Set<string>();

function isRealValue(val?: string): boolean {
  const trimmed = val?.trim() ?? '';
  return Boolean(trimmed) && !PLACEHOLDER_VALUES.has(trimmed);
}

/**
 * Loads or reloads environment variables from `.env` in the current working directory
 * without overwriting variables explicitly provided by the parent shell.
 */
export function loadEnvFile(envPath = path.join(process.cwd(), '.env')): void {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const seenKeys = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIndex = withoutExport.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, eqIndex).trim();
    let value = withoutExport.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    seenKeys.add(key);
    if (!shellDefinedKeys.has(key)) {
      process.env[key] = value;
      loadedFromEnvKeys.add(key);
    }
  }

  for (const prevKey of loadedFromEnvKeys) {
    if (!seenKeys.has(prevKey) && !shellDefinedKeys.has(prevKey)) {
      delete process.env[prevKey];
      loadedFromEnvKeys.delete(prevKey);
    }
  }
}

loadEnvFile();

/**
 * Reads runtime environment configuration for API, LLM, and GitHub MCP services.
 */
export function getEnvConfig(): EnvConfig {
  loadEnvFile();

  const portRaw = Number(process.env.PORT || 3000);
  const maxTokensRaw = Number(process.env.MAX_TOKENS || 8192);
  const timeoutRaw = Number(process.env.AGENT_TIMEOUT_MS || 120000);

  const hasBedrockCredentials =
    isRealValue(process.env.AWS_ACCESS_KEY_ID) &&
    isRealValue(process.env.AWS_SECRET_ACCESS_KEY);

  const rawOpenaiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
  const openaiApiKey = isRealValue(rawOpenaiKey) ? rawOpenaiKey.trim() : '';
  const hasOpenaiCredentials = Boolean(openaiApiKey);

  const openaiBaseUrl = (
    process.env.DEEPSEEK_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.deepseek.com/v1'
  ).trim();

  const rawModel = (process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || '').trim();
  const openaiModel =
    openaiBaseUrl.includes('deepseek.com') && (!rawModel || rawModel === 'gpt-4o')
      ? 'deepseek-chat'
      : rawModel || 'deepseek-chat';

  const rawGithubToken = process.env.GITHUB_TOKEN || '';
  const githubToken = isRealValue(rawGithubToken) ? rawGithubToken.trim() : '';
  const rawGithubUser = process.env.GITHUB_USERNAME || '';
  const githubUsername = isRealValue(rawGithubUser) ? rawGithubUser.trim() : '';

  const activeLlmProvider: LlmProvider = hasOpenaiCredentials
    ? 'openai'
    : hasBedrockCredentials
    ? 'bedrock'
    : 'none';

  return {
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    maxTokens: Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? maxTokensRaw : 8192,
    agentTimeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 120000,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    bedrockModelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    hasBedrockCredentials,
    openaiApiKey,
    openaiBaseUrl,
    openaiModel,
    hasOpenaiCredentials,
    githubToken,
    githubUsername,
    hasGithubCredentials: Boolean(githubToken),
    activeLlmProvider
  };
}
