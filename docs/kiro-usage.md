# How Kiro Was Used to Build GhostLink

> This document is a mandatory part of the Kiroween 2026 submission. It explains how Kiro features were used throughout the development of GhostLink.

---

## Kiro IDE

GhostLink was built entirely inside the Kiro IDE. The multi-workspace setup in Kiro allowed both hackathon projects (GhostLink and the Resurrection entry) to live in the same workspace while remaining fully independent.

---

## Spec-Driven Development

The entire GhostLink architecture was designed spec-first using `.kiro/specs/ghostlink.md`.

**How the spec was structured:**
- Functional requirements (FR-1 through FR-8) defined each agent's contract before any code was written
- The agent pipeline architecture was drawn out in the spec as an ASCII diagram
- A task checklist in the spec served as the implementation roadmap

**Impact vs. vibe coding:**
Spec-driven development forced clarity on the agent interface contract early. Without the spec, the temptation would have been to wire agents together ad-hoc, leading to tight coupling. The spec made each agent independently testable from day one.

---

## Agent Hooks

Three hooks were created in `.kiro/hooks/`:

### 1. `lint-on-save.json`
- **Trigger**: `PostFileSave` on any `.ts`, `.tsx`, or `.js` file
- **Action**: Runs `npm run lint` automatically
- **Impact**: Caught TypeScript errors and ESLint violations immediately on save, eliminating a whole class of "it worked on my machine" bugs before they accumulated

### 2. `test-on-agent-save.json`
- **Trigger**: `PostFileSave` on any file in `src/agents/`
- **Action**: Runs the full test suite via `npm run test`
- **Impact**: Every time an agent was modified, the property-based tests ran automatically. This caught several regressions in the Modernizer Agent's output parsing logic that would otherwise have been missed until integration testing.

### 3. `compliance-check.json`
- **Trigger**: `SessionStart`
- **Action**: Agent prompt that verifies `.kiro/` is not gitignored, LICENSE exists, and README mentions the hackathon category
- **Impact**: Prevented the most common disqualification risk — accidentally committing a `.gitignore` that excludes `.kiro/`

---

## Steering Documents

Two steering files in `.kiro/steering/`:

### `project-overview.md` (always included)
Provides Kiro with the full project context: what GhostLink is, the tech stack, code style conventions, file naming conventions, and hackathon compliance reminders. This eliminated repetitive context-setting at the start of every session.

### `agent-guidelines.md` (always included)
Defines the `Agent` interface contract, LLM prompt guidelines (temperature settings, output format requirements), and output file naming conventions. This steered Kiro to generate agents that were consistent and interoperable from the first attempt.

**Most impactful steering strategy:** Including the TypeScript interface directly in the steering file. When Kiro generated any new agent, it automatically conformed to the `Agent<TInput, TOutput>` interface without being asked.

---

## MCP (Model Context Protocol)

The **GitHub MCP server** was integrated to power the optional "push to GitHub" feature in GhostLink's Deploy Agent.

**What MCP enabled:**
- Creating a new GitHub repository programmatically from within the agent pipeline
- Committing all modernized output files to the new repo in a single operation
- Opening a pull request with the decision log as the PR body — directly from Kiro

**Without MCP**, this would have required building a custom GitHub API wrapper with auth handling, error retries, and rate limiting. The MCP server abstracted all of that.

---

## Kiro Crew (Multi-Agent)

GhostLink's entire value proposition is the multi-agent pipeline. Kiro Crew was used to orchestrate five specialized agents:

1. **Archaeology Agent** — code parsing and intent extraction
2. **Documentation Agent** — living docs and data flow diagrams
3. **Modernizer Agent** — code rewriting with decision logging
4. **Test Agent** — property-based test generation
5. **Deploy Agent** — Docker and CI/CD scaffolding

Each agent was developed and iterated on independently using Kiro's spec and steering context. The agents communicate through file-based outputs (JSON and Markdown), making the pipeline inspectable and debuggable at every step.

---

## Property-Based Testing (PBT)

The Test Agent generates property-based tests using **fast-check**. PBT was also used internally to test GhostLink's own parser logic.

**Where PBT caught issues unit tests would have missed:**
- The legacy PHP parser failed on files with Windows-style `\r\n` line endings — a PBT shrinking run identified the minimal failing input in seconds
- The Modernizer Agent's JSON output parser failed silently when the LLM returned trailing commas (valid in JavaScript, invalid in JSON) — PBT found this with a generated edge-case string

---

## Summary

| Kiro Feature | Used | Impact |
|---|---|---|
| Kiro IDE | ✅ | Primary development environment |
| Spec-driven development | ✅ | Architecture clarity, agent contracts |
| Agent Hooks | ✅ | Automated lint, test, compliance |
| Steering Docs | ✅ | Consistent agent interface, code style |
| MCP (GitHub) | ✅ | Automated repo creation and PR |
| Kiro Crew | ✅ | Multi-agent pipeline orchestration |
| Property-based testing | ✅ | Parser and output validation |
