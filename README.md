# 👻 GhostLink — Multi-Agent Legacy Code Modernization Tool

> **Kiroween 2026 Hackathon Entry — Category: Frankenstein**
> Stitch together legacy code archaeology, multi-agent AI, property-based testing, and modern deployment into one hauntingly powerful tool.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Kiroween 2026](https://img.shields.io/badge/Kiroween-2026-orange.svg)](https://kiroween.devpost.com)

---

## What is GhostLink?

GhostLink is a multi-agent application that takes any legacy codebase — old PHP, COBOL, Delphi, Classic ASP, VB6, or others — and passes it through a crew of specialized AI agents to:

1. **Understand it** — reverse-engineer intent and generate living documentation
2. **Modernize it** — port to a chosen modern stack with full decision explanations
3. **Test it** — auto-generate property-based tests comparing legacy vs. modern behavior
4. **Deploy it** — scaffold a ready-to-use CI/CD pipeline for the modernized project

The name "GhostLink" reflects the bridge between dead code and living software.

---

## The Frankenstein Stitch

GhostLink combines technologies that have no business being in the same room:

| Technology | Role |
|---|---|
| Legacy language parsers (tree-sitter) | Dissect old codebases |
| Kiro Crew (multi-agent) | Orchestrate specialized AI agents |
| LLM APIs (Bedrock / OpenAI) | Code understanding + modernization |
| Property-based testing (fast-check) | Behavioral equivalence verification |
| GitHub MCP | Repo creation, commits, PR automation |
| React + Tailwind UI | Polished drag-and-drop interface |
| Docker + GitHub Actions | Deployment scaffolding |

---

## Features

- 📂 **Upload or paste** legacy code — supports PHP 4/5, Classic ASP, VB6, COBOL snippets, Delphi
- 🔍 **Archaeology Agent** — maps functions, globals, side effects, and hidden business logic
- 📝 **Documentation Agent** — generates human-readable intent docs from dead code
- ⚙️ **Modernizer Agent** — rewrites to TypeScript/Python/Go with annotated decision log
- 🧪 **Test Agent** — generates property-based tests proving behavioral equivalence
- 🚀 **Deploy Agent** — creates Dockerfile, GitHub Actions workflow, and deployment README
- 🌐 **Web UI** — upload, configure, and download results with a polished interface
- 🔗 **GitHub MCP integration** — push modernized code directly to a new GitHub repo

---

## Project Structure

```
ghostlink/
├── .kiro/                    # Kiro IDE configuration (required for judging)
│   ├── specs/                # Spec-driven development files
│   ├── hooks/                # Agent automation hooks
│   └── steering/             # Steering documents for Kiro agents
├── src/
│   ├── agents/               # Individual Kiro Crew agent definitions
│   ├── api/                  # Backend API (Node.js / Express)
│   ├── parser/               # Legacy language parsing (tree-sitter)
│   ├── modernizer/           # Code modernization logic
│   ├── tester/               # Property-based test generation
│   ├── ui/                   # React frontend
│   └── mcp/                  # MCP server integrations
├── public/                   # Static assets
├── examples/
│   ├── legacy-samples/       # Sample legacy codebases for demo
│   └── modernized-output/    # Example modernized outputs
├── docs/                     # Documentation and Kiro usage write-up
├── package.json
├── LICENSE                   # MIT License
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- An AWS Bedrock or OpenAI API key
- A GitHub Personal Access Token (for MCP GitHub integration)

### Installation

```bash
git clone https://github.com/<your-username>/ghostlink.git
cd ghostlink
npm install
```

### Configuration

```bash
cp .env.example .env
# Edit .env with your API keys
```

### Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How Kiro Was Used

See [`docs/kiro-usage.md`](./docs/kiro-usage.md) for the full write-up on:
- Spec-driven development with `.kiro/specs/`
- Agent hooks automating lint, test, and deployment steps
- Steering documents guiding consistent agent behavior
- MCP integration for GitHub automation
- Kiro Crew orchestrating the multi-agent pipeline

---

## Kiroween 2026

This project was built during the [Kiroween 2026 Hackathon](https://kiroween.devpost.com) submission period (October 30 – December 4, 2026).

**Category:** Frankenstein — stitching together seemingly incompatible technologies into one unexpectedly powerful app.

---

## License

[MIT](./LICENSE)
