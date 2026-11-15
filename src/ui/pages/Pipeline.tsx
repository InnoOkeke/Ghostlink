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

    // Fetch current snapshot immediately so reloads/late joins show accurate state
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-purple-200">
            {allDone ? '✅ Pipeline Complete' : hasFailed ? '💀 Pipeline Halted' : '🌀 Pipeline Running'}
          </h1>
          <p className="text-sm text-purple-400 mt-1">
            Job: <span className="text-purple-300 font-mono">{jobId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-red-500'
            } animate-pulse`}
          />
          <span className="text-xs text-purple-400">{connected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      {allDone && (
        <div className="ghost-card border-emerald-700 bg-emerald-950/40 text-center space-y-3">
          <p className="text-2xl">✅</p>
          <p className="specter-glow font-bold">Pipeline Complete! Redirecting to results...</p>
          <div>
            <Link to={`/results/${jobId}`} className="ghost-btn-green inline-block text-sm">
              View Results Now →
            </Link>
          </div>
        </div>
      )}

      {githubNotice && (
        <div className="ghost-card border-purple-600 bg-purple-950/50 text-sm text-purple-200">
          🐙 {githubNotice}
        </div>
      )}

      {hasFailed && (
        <div className="ghost-card border-red-700 bg-red-950/40 text-center space-y-3">
          <p className="text-2xl">💀</p>
          <p className="text-red-300 font-bold">
            Pipeline failed. Check the failing step details below.
          </p>
          {pipelineError && (
            <p className="text-xs text-red-200 font-mono bg-red-950/80 border border-red-800 rounded px-3 py-2 max-w-2xl mx-auto">
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
              className="ghost-btn-green text-sm disabled:opacity-50"
            >
              {retrying ? '🌀 Resuming...' : '🔄 Retry Failed Step'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
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

      <div className="text-center text-xs text-purple-600 pb-4">
        Status: <span className="text-purple-400">{overallStatus}</span>
      </div>
    </div>
  );
}
