import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AgentStep from '../components/AgentStep';

interface StepState {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  logs: string[];
}

interface JobSnapshot {
  jobId: string;
  status: string;
  error?: string;
  steps: Array<{
    name: string;
    status: 'pending' | 'running' | 'done' | 'error';
    progress: number;
    message: string;
  }>;
}

const AGENT_NAMES = [
  'ArchaeologyAgent',
  'DocumentationAgent',
  'ModernizerAgent',
  'TestAgent',
  'DeployAgent'
];

const DEFAULT_STEPS: StepState[] = AGENT_NAMES.map((name) => ({
  name,
  status: 'pending',
  progress: 0,
  message: 'Waiting to start...',
  logs: []
}));

export default function Pipeline() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<StepState[]>(DEFAULT_STEPS);
  const [overallStatus, setOverallStatus] = useState<string>('pending');
  const [pipelineError, setPipelineError] = useState<string>('');
  const [githubNotice, setGithubNotice] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then((res: { data?: JobSnapshot; error?: string }) => {
        if (!res.data) {
          if (res.error) setPipelineError(res.error);
          return;
        }
        setOverallStatus(res.data.status);
        if (res.data.error) setPipelineError(res.data.error);
        setSteps(
          res.data.steps.map((s) => ({
            name: s.name,
            status: s.status,
            progress: s.progress,
            message: s.message,
            logs: []
          }))
        );
      })
      .catch(() => undefined);

    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type: string;
          step?: string;
          message?: string;
          error?: string;
          percent?: number;
          jobStatus?: string;
          status?: string;
          job?: JobSnapshot;
        };

        if (data.type === 'snapshot' && data.job) {
          setOverallStatus(data.job.status);
          if (data.job.error) setPipelineError(data.job.error);
          setSteps(
            data.job.steps.map((s) => ({
              name: s.name,
              status: s.status,
              progress: s.progress,
              message: s.message,
              logs: []
            }))
          );
          return;
        }

        if (data.type === 'pipeline:start') {
          setPipelineError('');
          setOverallStatus('running');
        }

        if (data.type === 'progress' && data.step) {
          setSteps((prev) =>
            prev.map((s) =>
              s.name === data.step
                ? {
                    ...s,
                    progress: data.percent ?? s.progress,
                    message: data.message ?? s.message,
                    status: 'running',
                    logs: [
                      ...s.logs,
                      `[${new Date().toLocaleTimeString()}] ${data.message ?? ''}`
                    ]
                  }
                : s
            )
          );
          if (data.jobStatus) setOverallStatus(data.jobStatus);
        }

        if (data.type === 'step:done' && data.step) {
          setSteps((prev) =>
            prev.map((s) =>
              s.name === data.step ? { ...s, status: 'done', progress: 100 } : s
            )
          );
        }

        if (data.type === 'step:github') {
          setGithubNotice(data.message ?? 'Pushing modernized repository to GitHub via MCP...');
        }

        if (data.type === 'github:error') {
          setGithubNotice(`GitHub MCP push warning: ${data.error ?? 'Push failed'}`);
        }

        if (data.type === 'pipeline:error' && data.step) {
          const errMsg = data.error ?? data.message ?? 'Pipeline step failed';
          setPipelineError(errMsg);
          setSteps((prev) =>
            prev.map((s) =>
              s.name === data.step
                ? {
                    ...s,
                    status: 'error',
                    message: errMsg,
                    logs: [...s.logs, `[${new Date().toLocaleTimeString()}] ERROR: ${errMsg}`]
                  }
                : s
            )
          );
          setOverallStatus('failed');
        }

        if (data.type === 'pipeline:complete') {
          setOverallStatus('completed');
          setTimeout(() => {
            navigate(`/results/${jobId}`);
          }, 1500);
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, [jobId, navigate, streamGeneration]);

  const handleRetry = async () => {
    if (!jobId) return;
    setRetrying(true);
    setPipelineError('');

    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to retry pipeline');
      }
      setOverallStatus('running');
      setStreamGeneration((g) => g + 1);
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Retry request failed');
    } finally {
      setRetrying(false);
    }
  };

  const allDone = steps.every((s) => s.status === 'done') && overallStatus === 'completed';
  const hasFailed = overallStatus === 'failed' || steps.some((s) => s.status === 'error');
  const totalProgress = Math.round(
    steps.reduce((acc, s) => acc + (s.status === 'done' ? 100 : s.progress), 0) / steps.length
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="ghost-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold text-white tracking-tight">
                {allDone
                  ? 'Modernization Complete'
                  : hasFailed
                    ? 'Pipeline Halted'
                    : 'Executing Modernization Pipeline'}
              </h1>
            </div>
            <p className="text-xs text-zinc-400">
              Job ID <span className="font-mono text-zinc-200">{jobId}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-zinc-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                }`}
              />
              {connected ? 'Live Stream' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Overall Progress</span>
            <span className="font-mono text-zinc-200">{totalProgress}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                hasFailed ? 'bg-red-500' : allDone ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      </div>

      {allDone && (
        <div className="rounded-2xl bg-emerald-950/35 border border-emerald-500/30 p-6 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">
            All five pipeline stages completed. Opening generated artifacts...
          </p>
          <div>
            <Link to={`/results/${jobId}`} className="ghost-btn-green text-xs">
              View Generated Artifacts →
            </Link>
          </div>
        </div>
      )}

      {githubNotice && (
        <div className="rounded-2xl bg-indigo-950/30 border border-indigo-400/25 px-5 py-3.5 text-xs text-indigo-200 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
          <span>{githubNotice}</span>
        </div>
      )}

      {hasFailed && (
        <div className="rounded-2xl bg-red-950/35 border border-red-500/30 p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-red-200">
            Pipeline stopped at a failing stage
          </p>
          {pipelineError && (
            <p className="text-xs text-red-200 font-mono bg-zinc-950/80 border border-red-500/25 rounded-xl px-4 py-3 max-w-2xl mx-auto text-left break-words">
              {pipelineError}
            </p>
          )}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                void handleRetry();
              }}
              disabled={retrying}
              className="ghost-btn-green text-xs disabled:opacity-50"
            >
              {retrying ? 'Resuming from failed step...' : 'Retry Failed Step'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step, idx) => (
          <AgentStep
            key={step.name}
            name={step.name}
            status={step.status}
            progress={step.progress}
            message={step.message}
            logs={step.logs}
            stepNumber={idx + 1}
          />
        ))}
      </div>

      <div className="text-center text-xs text-zinc-500 pb-4">
        Job state: <span className="font-mono text-zinc-300">{overallStatus}</span>
      </div>
    </div>
  );
}
