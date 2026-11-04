import React, { useState } from 'react';

interface AgentStepProps {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  logs: string[];
  stepNumber: number;
}

const STATUS_ICONS: Record<AgentStepProps['status'], string> = {
  pending: '⏳',
  running: '🔄',
  done: '✅',
  error: '💀'
};

const STATUS_COLORS: Record<AgentStepProps['status'], string> = {
  pending: 'border-purple-800',
  running: 'border-purple-500',
  done: 'border-emerald-600',
  error: 'border-red-600'
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  ArchaeologyAgent: 'Excavating functions, globals, business rules...',
  DocumentationAgent: 'Writing living documentation and diagrams...',
  ModernizerAgent: 'Rewriting code for the modern world...',
  TestAgent: 'Conjuring property-based tests...',
  DeployAgent: 'Building deployment scaffolding...'
};

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

  return (
    <div className={`ghost-card border-l-4 ${STATUS_COLORS[status]} space-y-3 transition-all duration-300`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-900 text-xs font-bold text-purple-300 shrink-0">
          {stepNumber}
        </div>

        <div
          className={`text-xl ${status === 'running' ? 'animate-spin' : ''}`}
          aria-label={`Status: ${status}`}
        >
          {STATUS_ICONS[status]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">{displayName}</h3>
            <span className="text-xs text-purple-500 shrink-0 ml-2">{progress}%</span>
          </div>
          <p className="text-xs text-purple-400 truncate">
            {status === 'pending' ? description : message}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-purple-900 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            status === 'error'
              ? 'bg-red-500'
              : status === 'done'
              ? 'bg-emerald-500'
              : 'bg-purple-400'
          } ${status === 'running' ? 'animate-pulse' : ''}`}
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
            onClick={() => setLogsOpen((v) => !v)}
            className="text-xs text-purple-500 hover:text-purple-300 transition-colors"
            aria-expanded={logsOpen}
            aria-controls={`logs-${name}`}
          >
            {logsOpen ? '▼ Hide logs' : `▶ Show logs (${logs.length})`}
          </button>

          {logsOpen && (
            <div
              id={`logs-${name}`}
              className="mt-2 bg-black/40 border border-purple-800 rounded-lg p-3 max-h-40 overflow-y-auto"
            >
              <code className="text-xs text-green-400 font-mono block space-y-0.5">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
