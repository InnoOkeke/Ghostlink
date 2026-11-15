import React, { useState } from 'react';

interface AgentStepProps {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  logs: string[];
  stepNumber: number;
}

const AGENT_DESCRIPTIONS: Record<string, string> = {
  ArchaeologyAgent: 'Excavating functions, global state, database queries, and business rules',
  DocumentationAgent: 'Generating architectural documentation and Mermaid data-flow diagrams',
  ModernizerAgent: 'Rewriting source into clean target architecture with decision logs',
  TestAgent: 'Synthesizing property-based and unit test suites',
  DeployAgent: 'Scaffolding production Dockerfile, compose manifest, CI, and deployment guide'
};

function StepStatusIcon({ status }: { status: AgentStepProps['status'] }) {
  if (status === 'done') {
    return (
      <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div className="w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center shrink-0">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="w-6 h-6 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
    </div>
  );
}

export default function AgentStep({
  name,
  status,
  progress,
  message,
  logs,
  stepNumber
}: AgentStepProps) {
  const [logsOpen, setLogsOpen] = useState(false);

  const displayName = name.replace('Agent', ' Agent');
  const description = AGENT_DESCRIPTIONS[name] ?? '';

  const borderClass =
    status === 'done'
      ? 'border-emerald-500/25'
      : status === 'running'
        ? 'border-indigo-400/40'
        : status === 'error'
          ? 'border-red-500/35'
          : 'border-white/[0.08]';

  return (
    <div
      className={`rounded-2xl bg-zinc-900/55 backdrop-blur-xl border ${borderClass} p-5 space-y-3.5 transition-all duration-300`}
    >
      <div className="flex items-center gap-3.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] font-mono text-zinc-400 shrink-0">
          0{stepNumber}
        </div>

        <StepStatusIcon status={status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">{displayName}</h3>
            <span className="text-xs font-mono text-zinc-400 shrink-0">{progress}%</span>
          </div>
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {status === 'pending' ? description : message}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-zinc-800/90 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            status === 'error'
              ? 'bg-red-500'
              : status === 'done'
                ? 'bg-emerald-500'
                : 'bg-indigo-500'
          }`}
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Logs toggle */}
      {logs.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-expanded={logsOpen}
            aria-controls={`logs-${name}`}
          >
            <svg
              className={`w-3 h-3 transition-transform ${logsOpen ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>{logsOpen ? 'Hide execution logs' : `View execution logs (${logs.length})`}</span>
          </button>

          {logsOpen && (
            <div
              id={`logs-${name}`}
              className="mt-2.5 bg-zinc-950 border border-white/[0.08] rounded-xl p-3.5 max-h-44 overflow-y-auto"
            >
              <code className="text-xs text-zinc-300 font-mono block space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
