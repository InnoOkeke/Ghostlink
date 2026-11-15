import fs from 'fs/promises';
import path from 'path';
import type { Agent, AgentContext, AgentResult, CodeMap } from './types.js';
import { invokeModel } from '../api/services/llm.js';

export type DeployInput = {
  targetStack: string;
  projectName: string;
  codeMap?: CodeMap;
  modernizedFiles?: string[];
};

export type DeployOutput = {
  deployFiles: string[];
};

function getDockerfileSystemPrompt(): string {
  return `You are a Docker expert. Generate a production-ready Dockerfile for the given stack.
Requirements:
- Use a multi-stage build
- Use official slim/alpine base images
- Run as non-root user
- Set appropriate WORKDIR, COPY, and CMD instructions
- Expose the correct port (3000 for Node/TypeScript, 8000 for Python, 8080 for Go)
Return ONLY the Dockerfile content, no markdown fences, no explanation.`;
}

function getDockerComposeSystemPrompt(): string {
  return `You are a Docker Compose expert. Generate a docker-compose.yml with:
- The main application service
- A PostgreSQL database service named "db" if the application uses a database
- Proper environment variables with defaults
- Volume for database persistence if a database service is present
- Health checks
Return ONLY the docker-compose.yml content, no markdown fences.`;
}

function getGithubActionsSystemPrompt(): string {
  return `You are a GitHub Actions CI expert. Generate a ci.yml workflow that:
- Triggers on push and pull_request to main
- Installs dependencies
- Runs linting/typechecking
- Runs tests
- Builds the application
- Uses the correct Node.js/Python/Go version
Return ONLY the YAML workflow content, no markdown fences.`;
}

function getDeploymentDocSystemPrompt(): string {
  return `You are a DevOps documentation expert. Generate a clear, stack-accurate DEPLOYMENT.md guide in Markdown for the modernized project.
Requirements:
- Tailor prerequisites, local run commands, and test commands strictly to the target stack (Node.js/TypeScript, Python, or Go)
- Document the generated Dockerfile, docker-compose.yml, and .github/workflows/ci.yml
- List only environment variables relevant to the modernized application itself (e.g., PORT, DATABASE_URL if DB calls exist), never internal code-generation tool keys
- Return ONLY Markdown content, no outer markdown fences.`;
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  return match ? match[1].trim() : trimmed;
}

export class DeployAgent implements Agent<DeployInput, DeployOutput> {
  name = 'DeployAgent';
  description = 'Generates deployment scaffolding: Dockerfile, docker-compose, GitHub Actions, DEPLOYMENT.md';

  async run(
    input: DeployInput,
    context: AgentContext
  ): Promise<AgentResult<DeployOutput>> {
    const start = Date.now();
    const outputDir = path.join(context.outputDir, 'deploy');
    const ciDir = path.join(outputDir, '.github', 'workflows');

    try {
      context.onProgress('Setting up deploy scaffolding...', 0);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.mkdir(ciDir, { recursive: true });

      const deployFiles: string[] = [];
      const fileNames = (input.modernizedFiles ?? []).map((f) => path.basename(f));
      const hasDb = (input.codeMap?.dbCalls?.length ?? 0) > 0;
      const projectSummary = [
        `Project: ${input.projectName}`,
        `Target stack: ${input.targetStack}`,
        `Modernized files: ${fileNames.join(', ') || 'not specified'}`,
        `Uses database: ${hasDb ? `yes (${input.codeMap?.dbCalls.slice(0, 5).join('; ')})` : 'no'}`,
        `External dependencies: ${input.codeMap?.externalDeps.join(', ') || 'none'}`
      ].join('\n');

      // Dockerfile
      context.onProgress('Generating Dockerfile...', 20);
      const dockerfileResult = await invokeModel({
        messages: [
          {
            role: 'user',
            content: `Generate a production-ready Dockerfile for this modernized project:\n${projectSummary}`
          }
        ],
        system: getDockerfileSystemPrompt(),
        temperature: 0.2,
        maxTokens: 1024
      });

      const dockerfile = stripFences(dockerfileResult.content);
      const dockerfilePath = path.join(outputDir, 'Dockerfile');
      await fs.writeFile(dockerfilePath, dockerfile, 'utf-8');
      deployFiles.push(dockerfilePath);

      // docker-compose.yml
      context.onProgress('Generating docker-compose.yml...', 45);
      const composeResult = await invokeModel({
        messages: [
          {
            role: 'user',
            content: `Generate a docker-compose.yml for this modernized project:\n${projectSummary}`
          }
        ],
        system: getDockerComposeSystemPrompt(),
        temperature: 0.2,
        maxTokens: 1024
      });

      const compose = stripFences(composeResult.content);
      const composePath = path.join(outputDir, 'docker-compose.yml');
      await fs.writeFile(composePath, compose, 'utf-8');
      deployFiles.push(composePath);

      // GitHub Actions CI
      context.onProgress('Generating GitHub Actions workflow...', 70);
      const ciResult = await invokeModel({
        messages: [
          {
            role: 'user',
            content: `Generate a GitHub Actions CI workflow for this modernized project:\n${projectSummary}`
          }
        ],
        system: getGithubActionsSystemPrompt(),
        temperature: 0.2,
        maxTokens: 1024
      });

      const ci = stripFences(ciResult.content);
      const ciPath = path.join(ciDir, 'ci.yml');
      await fs.writeFile(ciPath, ci, 'utf-8');
      deployFiles.push(ciPath);

      // DEPLOYMENT.md
      context.onProgress('Generating DEPLOYMENT.md...', 90);
      const deploymentResult = await invokeModel({
        messages: [
          {
            role: 'user',
            content: `Generate a DEPLOYMENT.md guide for this modernized project:\n${projectSummary}\n\nDockerfile:\n${dockerfile}\n\ndocker-compose.yml:\n${compose}\n\nci.yml:\n${ci}`
          }
        ],
        system: getDeploymentDocSystemPrompt(),
        temperature: 0.3,
        maxTokens: 2048
      });

      const deploymentMd = deploymentResult.content.trim();
      const deploymentMdPath = path.join(outputDir, 'DEPLOYMENT.md');
      await fs.writeFile(deploymentMdPath, deploymentMd, 'utf-8');
      deployFiles.push(deploymentMdPath);

      context.onProgress('Deploy scaffolding complete', 100);

      return {
        success: true,
        output: { deployFiles },
        durationMs: Date.now() - start
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, durationMs: Date.now() - start };
    }
  }
}
