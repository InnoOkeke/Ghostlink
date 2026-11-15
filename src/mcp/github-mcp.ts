import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getEnvConfig } from '../api/services/env.js';

export interface PushToGithubParams {
  repoName: string;
  files: Array<{ path: string; content: string }>;
  decisionLog: string;
  token?: string;
}

export interface PushToGithubResult {
  repoUrl: string;
  prUrl: string;
}

interface McpToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

function extractToolText(result: McpToolResult, toolName: string): string {
  const text = (result.content ?? [])
    .map((item) => item.text ?? '')
    .filter(Boolean)
    .join('\n');

  if (result.isError) {
    throw new Error(`GitHub MCP tool "${toolName}" failed: ${text || 'Unknown error'}`);
  }

  return text;
}

async function collectFilesRecursively(
  dir: string,
  baseDir: string
): Promise<Array<{ path: string; content: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: Array<{ path: string; content: string }> = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFilesRecursively(fullPath, baseDir);
      results.push(...nested);
    } else if (entry.isFile()) {
      if (entry.name === 'job.json') {
        continue;
      }
      const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      const content = await fs.readFile(fullPath, 'utf-8');
      results.push({ path: relativePath, content });
    }
  }

  return results;
}

/**
 * Pushes generated files to a new GitHub repository and opens a PR via GitHub MCP.
 */
export async function pushToGithub(
  params: PushToGithubParams
): Promise<PushToGithubResult> {
  const token = params.token?.trim() || getEnvConfig().githubToken.trim();

  if (!token) {
    throw new Error(
      'GitHub token is not configured. Set GITHUB_TOKEN in .env or provide a Personal Access Token.'
    );
  }

  if (!params.repoName.trim()) {
    throw new Error('GitHub repository name is required.');
  }

  const baseRepoName = params.repoName.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  let client: Client | null = null;

  try {
    const localServerEntry = path.join(
      process.cwd(),
      'node_modules',
      '@modelcontextprotocol',
      'server-github',
      'dist',
      'index.js'
    );
    const useLocalEntry = fsSync.existsSync(localServerEntry);
    const command = useLocalEntry
      ? process.execPath
      : process.platform === 'win32'
        ? 'npx.cmd'
        : 'npx';
    const args = useLocalEntry
      ? [localServerEntry]
      : ['-y', '@modelcontextprotocol/server-github'];

    const transport = new StdioClientTransport({
      command,
      args,
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: token
      } as Record<string, string>
    });

    client = new Client(
      { name: 'ghostlink', version: '0.1.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    // Create repository (retry once with unique suffix if name already exists)
    let createRepoResult = (await client.callTool({
      name: 'create_repository',
      arguments: {
        name: baseRepoName,
        description: 'Modernized by GhostLink — Kiroween 2026',
        private: false,
        autoInit: true
      }
    })) as McpToolResult;

    if (createRepoResult.isError) {
      const errText = (createRepoResult.content ?? [])
        .map((item) => item.text ?? '')
        .join('\n');
      if (/already exists/i.test(errText)) {
        const uniqueRepoName = `${baseRepoName}-${Date.now().toString(36).slice(-4)}`;
        createRepoResult = (await client.callTool({
          name: 'create_repository',
          arguments: {
            name: uniqueRepoName,
            description: 'Modernized by GhostLink — Kiroween 2026',
            private: false,
            autoInit: true
          }
        })) as McpToolResult;
      }
    }

    const repoText = extractToolText(createRepoResult, 'create_repository');
    const repoJson = JSON.parse(repoText || '{}') as {
      html_url?: string;
      full_name?: string;
      default_branch?: string;
    };

    if (!repoJson.full_name || !repoJson.html_url) {
      throw new Error('GitHub MCP create_repository did not return repository metadata.');
    }

    const repoUrl = repoJson.html_url;
    const [owner, repo] = repoJson.full_name.split('/');
    const baseBranch = repoJson.default_branch || 'main';
    const branch = 'ghostlink-modernized';

    // Create branch from default branch
    const createBranchResult = (await client.callTool({
      name: 'create_branch',
      arguments: {
        owner,
        repo,
        branch,
        from_branch: baseBranch
      }
    })) as McpToolResult;
    extractToolText(createBranchResult, 'create_branch');

    // Commit files
    for (const file of params.files) {
      const commitResult = (await client.callTool({
        name: 'create_or_update_file',
        arguments: {
          owner,
          repo,
          path: file.path,
          message: `feat: add modernized ${file.path}`,
          content: Buffer.from(file.content, 'utf-8').toString('base64'),
          branch
        }
      })) as McpToolResult;
      extractToolText(commitResult, 'create_or_update_file');
    }

    // Create PR
    const prResult = (await client.callTool({
      name: 'create_pull_request',
      arguments: {
        owner,
        repo,
        title: 'GhostLink: Legacy Code Modernization',
        body: `## Modernization Summary\n\nThis PR was automatically generated by GhostLink.\n\n${params.decisionLog.slice(0, 3000)}`,
        head: branch,
        base: baseBranch
      }
    })) as McpToolResult;

    const prText = extractToolText(prResult, 'create_pull_request');
    const prJson = JSON.parse(prText || '{}') as { html_url?: string };

    if (!prJson.html_url) {
      throw new Error('GitHub MCP create_pull_request did not return a pull request URL.');
    }

    return { repoUrl, prUrl: prJson.html_url };
  } finally {
    if (client) {
      await client.close().catch(() => undefined);
    }
  }
}

/**
 * Reads all generated output files from a job output directory and pushes them to GitHub via MCP.
 */
export async function pushJobOutputToGithub(
  outputDir: string,
  repoName: string,
  token?: string
): Promise<PushToGithubResult> {
  const files = await collectFilesRecursively(outputDir, outputDir);

  if (files.length === 0) {
    throw new Error('No generated output files found to push to GitHub.');
  }

  let decisionLog = '';
  const decisionsPath = path.join(outputDir, 'modernized', 'decisions.md');
  const docsPath = path.join(outputDir, 'docs', 'documentation.md');

  try {
    decisionLog = await fs.readFile(decisionsPath, 'utf-8');
  } catch {
    try {
      decisionLog = await fs.readFile(docsPath, 'utf-8');
    } catch {
      decisionLog = 'Legacy code modernized via the GhostLink multi-agent pipeline.';
    }
  }

  return pushToGithub({
    repoName,
    files,
    decisionLog,
    token
  });
}
