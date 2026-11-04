import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type: string;
          step?: string;
          message?: string;
          percent?: number;
          jobStatus?: string;
          job?: JobSnapshot;
        };

        if (data.type === 'snapshot' && data.job) {
          setOverallStatus(data.job.status);
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

        if (data.type === 'progress' && data.step) {
          setSteps((prev) =>
            prev.map((s) =>
              s.name === data.step
                ? {
                    ...s,
                    progress: data.percent ?? s.progress,
                    message: data.message ?? s.message,
                    status: 'running',
                    logs: [...s.logs, `[${new Date().toLocaleTimeString()}] ${data.message ?? ''}`]
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

        if (data.type === 'pipeline:error' && data.step) {
          setSteps((prev) =>
            prev.map((s) =>
              s.name === data.step
                ? { ...s, status: 'error', message: data.message ?? 'Error' }
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
  }, [jobId, navigate]);

  const allDone = steps.every((s) => s.status === 'done');
  const hasFailed = steps.some((s) => s.status === 'error');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-purple-200">🌀 Pipeline Running</h1>
          <p className="text-sm text-purple-400 mt-1">Job: <span className="text-purple-300 font-mono">{jobId}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'} animate-pulse`}
          />
          <span className="text-xs text-purple-400">{connected ? 'Live' : 'Reconnecting...'}</span>
        </div>
      </div>

      {allDone && (
        <div className="ghost-card border-emerald-700 bg-emerald-950/40 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="specter-glow font-bold">Pipeline Complete! Redirecting to results...</p>
        </div>
      )}

      {hasFailed && (
        <div className="ghost-card border-red-700 bg-red-950/40 text-center space-y-2">
          <p className="text-2xl">💀</p>
          <p className="text-red-300 font-bold">Pipeline failed. Check the step below for details.</p>
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
