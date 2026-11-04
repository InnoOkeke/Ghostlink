---
inclusion: always
---

# GhostLink — Project Steering

## What This Project Is
GhostLink is a **Kiroween 2026 Frankenstein hackathon entry**. It is a multi-agent legacy code modernization tool that stitches together: legacy language parsers (tree-sitter), a Kiro Crew multi-agent pipeline, LLM-powered code understanding and rewriting, property-based testing (fast-check), GitHub MCP automation, and a React web UI.

## Core Principles
- **Agent-first**: All heavy lifting (parsing, modernizing, testing, deploying) is done by specialized agents, not monolithic code
- **Transparency**: Every agent decision must be logged and explainable
- **Reliability**: Each pipeline step is independently retryable; intermediate outputs are always saved
- **Hackathon compliance**: The `.kiro/` directory must always be committed and never gitignored

## Tech Stack
- **Backend**: Node.js + Express, TypeScript
- **Frontend**: React 18, Vite, Tailwind CSS
- **Parsing**: tree-sitter (legacy language grammars)
- **LLM**: AWS Bedrock Claude 3.5 Sonnet (primary), OpenAI GPT-4o (fallback)
- **Property-based testing**: fast-check (TypeScript), Vitest
- **MCP**: GitHub MCP server integration
- **Containerization**: Docker + GitHub Actions

## Code Style
- TypeScript strict mode everywhere
- ESM modules (`"type": "module"` in package.json)
- Named exports preferred over default exports
- Every agent must implement the `Agent` interface from `src/agents/types.ts`
- Async/await, no raw callbacks
- All API responses follow `{ success: boolean, data?: T, error?: string }`

## Agent Pipeline Order
1. Archaeology Agent → `code-map.json` + `intent.md`
2. Documentation Agent → `docs.md` + `dataflow.mmd`
3. Modernizer Agent → modernized source files + `decisions.md`
4. Test Agent → property-based test files
5. Deploy Agent → `Dockerfile`, `docker-compose.yml`, GitHub Actions workflow

## File Conventions
- Agent source files go in `src/agents/<agent-name>.ts`
- API routes go in `src/api/routes/<resource>.ts`
- React components go in `src/ui/components/`
- React pages go in `src/ui/pages/`
- MCP integrations go in `src/mcp/`

## Hackathon Compliance Reminders
- Never add `.kiro/` to `.gitignore`
- The LICENSE file must be MIT and visible
- Demo video must be under 3 minutes
- Write-up must explain spec, hooks, steering, MCP, and Kiro Crew usage
- This is a **Frankenstein** category entry — always emphasize the unexpected technology combinations
