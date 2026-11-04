import fs from 'fs/promises';
import path from 'path';
import type { Agent, AgentContext, AgentResult } from './types.js';
import { invokeModel } from '../api/services/llm.js';

type DeployInput = {
  targetStack: string;
  projectName: string;
};

type DeployOutput = {
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
- A PostgreSQL database service named "db"
- Proper environment variables with defaults
- Volume for database persistence
- Health checks
Return ONLY the docker-compose.yml content, no markdown fences.`;
}

function getGithubActionsSystemPrompt(): string {
  return `You are a GitHub Actions CI expert. Generate a ci.yml workflow that:
- Triggers on push and pull_request to main
- Installs dependencies
- Runs linting
- Runs tests
- Builds the application
- Uses the correct Node.js/Python/Go version
Return ONLY the YAML workflow content, no markdown fences.`;
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

      // Dockerfile
      context.onProgress('Generating Dockerfile...', 25);
      const dockerfileResult = await invokeModel({
        messages: [{
          role: 'user',
          content: `Generate a production-ready Dockerfile for a ${input.targetStack} project named "${input.projectName}".`
        }],
        system: getDockerfileSystemPrompt(),
        temperature: 0.2,
        maxTokens: 1024
      });

      let dockerfile = dockerfileResult.content.trim();
      const dockerFence = dockerfile.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      if (dockerFence) dockerfile = dockerFence[1].trim();

      const dockerfilePath = path.join(outputDir, 'Dockerfile');
      await fs.writeFile(dockerfilePath, dockerfile, 'utf-8');
      deployFiles.push(dockerfilePath);

      // docker-compose.yml
      context.onProgress('Generating docker-compose.yml...', 50);
      const composeResult = await invokeModel({
        messages: [{
          role: 'user',
          content: `Generate a docker-compose.yml for a ${input.targetStack} project named "${input.projectName}" with a PostgreSQL database.`
        }],
        system: getDockerComposeSystemPrompt(),
        temperature: 0.2,
        maxTokens: 1024
      });

      let compose = composeResult.content.trim();
      const composeFence = compose.match(/```(?:yaml|yml)?\s*([\s\S]*?)```/);
      if (composeFence) compose = composeFence[1].trim();

      const composePath = path.join(outputDir, 'docker-compose.yml');
      await fs.writeFile(composePath, compose, 'utf-8');
      deployFiles.push(composePath);

      // GitHub Actions CI
      context.onProgress('Generating GitHub Actions workflow...', 75);
      const ciResult = await invokeModel({
        messages: [{
          role: 'user',
          content: `Generate a GitHub Actions CI workflow for a ${input.targetStack} project named "${input.projectName}".`
        }],
        system: getGithubActionsSystemPrompt(),
        temperature: 0.2,
        maxTokens: 1024
      });

      let ci = ciResult.content.trim();
      const ciFence = ci.match(/```(?:yaml|yml)?\s*([\s\S]*?)```/);
      if (ciFence) ci = ciFence[1].trim();

      const ciPath = path.join(ciDir, 'ci.yml');
      await fs.writeFile(ciPath, ci, 'utf-8');
      deployFiles.push(ciPath);

      // DEPLOYMENT.md
      context.onProgress('Generating DEPLOYMENT.md...', 90);
      const deploymentMd = `# Deployment Guide — ${input.projectName}

## Prerequisites
- Docker & Docker Compose installed
- Node.js 20+ (for local development)
- AWS credentials configured (for Bedrock LLM calls)

## Quick Start

### Docker Compose (Recommended)
\`\`\`bash
docker-compose up --build
\`\`\`

### Local Development
\`\`\`bash
npm install
npm run dev
\`\`\`

## Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| \`AWS_REGION\` | AWS region for Bedrock | Yes |
| \`AWS_ACCESS_KEY_ID\` | AWS access key | Yes |
| \`AWS_SECRET_ACCESS_KEY\` | AWS secret key | Yes |
| \`DATABASE_URL\` | PostgreSQL connection URL | Yes |
| \`GITHUB_TOKEN\` | GitHub personal access token (for MCP) | Optional |
| \`PORT\` | API server port (default: 3000) | No |

## CI/CD
The included GitHub Actions workflow (\`.github/workflows/ci.yml\`) will:
1. Run on every push and pull request to \`main\`
2. Install dependencies
3. Run type checking
4. Run tests
5. Build the application

## Stack
- Target: **${input.targetStack}**
- Container: Docker (multi-stage build)
- Database: PostgreSQL
- CI: GitHub Actions
`;

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
