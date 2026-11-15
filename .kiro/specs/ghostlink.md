# GhostLink — Spec

## Overview
GhostLink is a multi-agent legacy code modernization tool. It accepts legacy source code (PHP 4/5, Classic ASP, VB6, COBOL, Delphi) and passes it through a pipeline of specialized AI agents to produce: living documentation, modernized code, property-based tests, and a deployment scaffold.

## Requirements

### Functional Requirements

#### FR-1: Code Ingestion
- The system MUST accept legacy source code via file upload (drag-and-drop) or direct paste in the web UI
- Supported input languages: PHP 4/5, Classic ASP (VBScript), VB6, COBOL (subset), Delphi/Pascal
- Maximum file size: 500KB per file, up to 10 files per job

#### FR-2: Archaeology Agent
- The agent MUST parse the legacy code and extract: function signatures, global variables, side effects, database calls, external dependencies, and implicit business rules
- Output: a structured JSON "code map" and a human-readable intent document (Markdown)

#### FR-3: Documentation Agent
- The agent MUST generate living documentation from the archaeology output
- Documentation MUST include: module overview, function-by-function explanation, data flow diagram (Mermaid), known risks and legacy patterns identified

#### FR-4: Modernizer Agent
- The agent MUST rewrite the legacy code into a user-selected target stack (TypeScript/Node.js, Python, Go)
- Every significant decision MUST be logged in an annotated decision document
- Output: modernized source files + decision log

#### FR-5: Test Agent
- The agent MUST generate property-based tests using fast-check (TypeScript) or hypothesis (Python)
- Tests MUST cover: input/output equivalence, edge cases, and identified business rules
- Output: test files ready to run with `npm test` or `pytest`

#### FR-6: Deploy Agent
- The agent MUST scaffold: Dockerfile, docker-compose.yml, GitHub Actions CI workflow, and a DEPLOYMENT.md
- Output must be valid and runnable for the chosen target stack

#### FR-7: GitHub MCP Integration
- Users MAY opt to push the modernized project directly to a new GitHub repository
- The MCP integration MUST create the repo, commit all output files, and open an initial PR with the decision log as the PR body

#### FR-8: Web UI
- A React-based web interface MUST allow users to: upload code, select target stack, monitor agent progress in real-time, and download all outputs as a ZIP
- The UI MUST show a step-by-step progress indicator for each agent phase

### Non-Functional Requirements

#### NFR-1: Performance
- Each full modernization pipeline MUST complete within 5 minutes for inputs under 200KB
- The UI MUST show live streaming progress, not a spinner

#### NFR-2: Security
- API keys MUST never be exposed to the frontend
- All LLM calls MUST be made server-side

#### NFR-3: Reliability
- Each agent step MUST be independently retryable on failure
- The system MUST save intermediate outputs so a failed pipeline can resume

## Architecture

### Agent Pipeline
```
User Input (legacy code)
       │
       ▼
┌─────────────────┐
│ Archaeology     │  → code-map.json, intent.md
│ Agent           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Documentation   │  → docs.md, dataflow.mmd
│ Agent           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Modernizer      │  → modernized/ src files, decisions.md
│ Agent           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Test            │  → tests/ directory
│ Agent           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Deploy          │  → Dockerfile, CI workflow, DEPLOYMENT.md
│ Agent           │
└────────┬────────┘
         │
         ▼ (optional)
┌─────────────────┐
│ GitHub MCP      │  → new GitHub repo with PR
│ Integration     │
└─────────────────┘
```

### Tech Stack
- **Backend**: Node.js + Express (TypeScript)
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Parsing**: tree-sitter with language grammars
- **LLM**: AWS Bedrock (Claude 3.5 Sonnet) / OpenAI GPT-4o
- **Testing**: fast-check (property-based), Vitest
- **MCP**: GitHub MCP server
- **Containerization**: Docker

## Tasks

- [x] Set up monorepo with backend API and frontend UI
- [x] Implement legacy code parser
- [x] Build Archaeology Agent with structured JSON output
- [x] Build Documentation Agent with Mermaid diagram generation
- [x] Build Modernizer Agent with decision logging
- [x] Build Test Agent with fast-check integration
- [x] Build Deploy Agent (Dockerfile + GitHub Actions)
- [x] Implement GitHub MCP integration
- [x] Build React UI with real-time agent progress streaming
- [x] Add ZIP download for all outputs
- [x] Write property-based tests for parser and archaeology JSON extraction
- [x] Create example legacy code samples
- [ ] Record demo video (under 3 minutes)
- [x] Write Kiro usage documentation
