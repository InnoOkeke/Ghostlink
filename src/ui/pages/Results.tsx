import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CodeViewer from '../components/CodeViewer';

interface JobData {
  jobId: string;
  status: string;
  steps: Array<{ name: string; status: string; message: string }>;
  completedAt?: string;
  input?: {
    files: Array<{ name: string; language: string }>;
    targetStack: string;
    githubRepo?: string;
  };
  githubResult?: { repoUrl: string; prUrl: string };
  githubError?: string;
}

interface ArtifactItem {
  filename: string;
  relativePath: string;
  language: string;
  content: string;
}

interface ArtifactsResponse {
  archaeology: ArtifactItem[];
  documentation: ArtifactItem[];
  modernized: ArtifactItem[];
  tests: ArtifactItem[];
  deploy: ArtifactItem[];
  original: ArtifactItem[];
}

type Tab = 'archaeology' | 'documentation' | 'modernized' | 'tests' | 'deploy';

const TAB_LABELS: Record<Tab, string> = {
  modernized: 'Modernized Code',
  archaeology: 'Archaeology',
  documentation: 'Documentation',
  tests: 'Test Suite',
  deploy: 'Deploy Config'
};

export default function Results() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobData | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('modernized');
  const [compareSideBySide, setCompareSideBySide] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [githubPanelOpen, setGithubPanelOpen] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubResult, setGithubResult] = useState<{ repoUrl?: string; prUrl?: string } | null>(null);
  const [githubError, setGithubError] = useState('');

  useEffect(() => {
    if (!jobId) return;

    Promise.all([
      fetch(`/api/jobs/${jobId}`).then(async (r) => {
        const json = (await r.json()) as { success: boolean; data?: JobData; error?: string };
        if (!r.ok || !json.success || !json.data) {
          throw new Error(json.error ?? 'Failed to load job');
        }
        return json.data;
      }),
      fetch(`/api/jobs/${jobId}/artifacts`).then(async (r) => {
        const json = (await r.json()) as {
          success: boolean;
          data?: ArtifactsResponse;
          error?: string;
        };
        if (!r.ok || !json.success || !json.data) {
          throw new Error(json.error ?? 'Failed to load job artifacts');
        }
        return json.data;
      })
    ])
      .then(([jobData, artifactData]) => {
        setJob(jobData);
        setArtifacts(artifactData);
        if (jobData.githubResult) {
          setGithubResult(jobData.githubResult);
        }
        if (jobData.githubError) {
          setGithubError(jobData.githubError);
        }
        const shortId = jobId.slice(0, 8);
        const defaultBase = jobData.input?.files?.[0]?.name
          ? jobData.input.files[0].name
              .replace(/\.[^.]+$/, '')
              .replace(/[^a-zA-Z0-9._-]/g, '-')
          : 'ghostlink';
        setRepoName(jobData.input?.githubRepo?.trim() || `${defaultBase}-modernized-${shortId}`);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load job results');
        setLoading(false);
      });
  }, [jobId]);

  const handleDownload = () => {
    window.open(`/api/jobs/${jobId}/download`, '_blank');
  };

  const handleGithubPush = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!jobId) return;

    setGithubLoading(true);
    setGithubError('');

    try {
      const res = await fetch(`/api/jobs/${jobId}/push-github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName: repoName.trim() || undefined,
          githubToken: githubToken.trim() || undefined
        })
      });
      const data = (await res.json()) as {
        success: boolean;
        data?: { repoUrl?: string; prUrl?: string };
        error?: string;
      };

      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error ?? 'Failed to push to GitHub');
      }

      setGithubResult(data.data);
      setGithubPanelOpen(false);
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Failed to push to GitHub');
    } finally {
      setGithubLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-24 space-y-4">
        <div className="mx-auto w-8 h-8 rounded-full border-2 border-white/15 border-t-indigo-400 animate-spin" />
        <p className="text-sm text-zinc-400">Loading generated artifacts...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto ghost-card border-red-500/30 bg-red-950/30 text-center space-y-4">
        <h1 className="text-lg font-semibold text-red-200">Unable to load job results</h1>
        <p className="text-xs text-red-300/90">{loadError}</p>
        <Link to="/" className="ghost-btn text-xs">
          ← Back to Studio
        </Link>
      </div>
    );
  }

  const activeFiles: ArtifactItem[] = artifacts ? artifacts[activeTab] : [];
  const originalFiles: ArtifactItem[] = artifacts ? artifacts.original : [];

  return (
    <div className="space-y-6">
      {/* Executive Summary Header */}
      <div className="ghost-card space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Modernization Complete
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight specter-glow">
              Resurrected Output &amp; Artifacts
            </h1>
            <p className="text-xs text-zinc-400">
              Job <span className="font-mono text-zinc-200">{jobId}</span>
              {job?.input?.targetStack && (
                <>
                  {' '}
                  · Stack{' '}
                  <span className="font-mono text-zinc-200 uppercase">
                    {job.input.targetStack}
                  </span>
                </>
              )}
              {job?.completedAt && <> · {new Date(job.completedAt).toLocaleString()}</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={handleDownload} className="ghost-btn text-xs">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download ZIP
            </button>
            <button
              type="button"
              onClick={() => setGithubPanelOpen((v) => !v)}
              disabled={githubLoading}
              className="ghost-btn-green text-xs disabled:opacity-50"
            >
              Push to GitHub
            </button>
            <Link to="/" className="ghost-btn text-xs">
              New Job
            </Link>
          </div>
        </div>

        {/* GitHub MCP Push Form */}
        {githubPanelOpen && (
          <form
            onSubmit={(e) => {
              void handleGithubPush(e);
            }}
            className="p-4 bg-zinc-950/80 border border-white/[0.1] rounded-xl space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Create GitHub Repository &amp; Open PR via MCP
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="block text-xs text-zinc-400">Repository Name</label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-modernized-app"
                  className="ghost-input w-full text-xs font-mono"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-zinc-400">
                  GitHub PAT (optional if server GITHUB_TOKEN is configured)
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="Leave blank to use configured token"
                  className="ghost-input w-full text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGithubPanelOpen(false)}
                className="ghost-btn text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={githubLoading}
                className="ghost-btn-green text-xs py-1.5 px-4 disabled:opacity-50"
              >
                {githubLoading ? 'Provisioning via MCP...' : 'Create Repo & Open PR'}
              </button>
            </div>
          </form>
        )}

        {githubError && (
          <div className="p-3.5 bg-red-950/50 border border-red-500/30 rounded-xl text-xs text-red-200">
            GitHub MCP Error: {githubError}
          </div>
        )}

        {githubResult && (
          <div className="p-4 bg-emerald-950/35 border border-emerald-500/25 rounded-xl text-xs space-y-1.5">
            {githubResult.repoUrl && (
              <p className="flex flex-wrap items-center gap-2 text-zinc-300">
                <span className="font-semibold text-emerald-300">Repository:</span>
                <a
                  href={githubResult.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-emerald-300 hover:underline"
                >
                  {githubResult.repoUrl}
                </a>
              </p>
            )}
            {githubResult.prUrl && (
              <p className="flex flex-wrap items-center gap-2 text-zinc-300">
                <span className="font-semibold text-emerald-300">Pull Request:</span>
                <a
                  href={githubResult.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-emerald-300 hover:underline"
                >
                  {githubResult.prUrl}
                </a>
              </p>
            )}
          </div>
        )}

        {/* Pipeline Stage Strip */}
        {job && (
          <div className="pt-2 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {job.steps.map((step) => (
              <div
                key={step.name}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-950/60 border border-white/[0.06]"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    step.status === 'done'
                      ? 'bg-emerald-400'
                      : step.status === 'error'
                        ? 'bg-red-400'
                        : 'bg-zinc-500'
                  }`}
                />
                <span className="text-xs font-medium text-zinc-300 truncate">
                  {step.name.replace('Agent', '')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Artifact Tabs + Side-by-Side Toggle */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-zinc-900/70 border border-white/[0.08]">
            {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
              const count = artifacts ? artifacts[tab].length : 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    activeTab === tab
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{TAB_LABELS[tab]}</span>
                  <span className="text-[11px] font-mono text-zinc-500">{count}</span>
                </button>
              );
            })}
          </div>

          {activeTab === 'modernized' && originalFiles.length > 0 && (
            <button
              type="button"
              onClick={() => setCompareSideBySide((v) => !v)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                compareSideBySide
                  ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:border-white/[0.16]'
              }`}
            >
              {compareSideBySide ? 'Side-by-Side Diff: ON' : 'Compare with Legacy Original'}
            </button>
          )}
        </div>

        {/* File Viewers */}
        {activeTab === 'modernized' && compareSideBySide ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-1">
                Legacy Original Source
              </h3>
              {originalFiles.map((file) => (
                <CodeViewer
                  key={file.relativePath}
                  filename={file.relativePath}
                  code={file.content}
                  language={file.language}
                />
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300 px-1">
                Modernized Output &amp; Decisions
              </h3>
              {activeFiles.map((file) => (
                <CodeViewer
                  key={file.relativePath}
                  filename={file.relativePath}
                  code={file.content}
                  language={file.language}
                />
              ))}
            </div>
          </div>
        ) : activeFiles.length > 0 ? (
          <div className="space-y-4">
            {activeFiles.map((file) => (
              <CodeViewer
                key={file.relativePath}
                filename={file.relativePath}
                code={file.content}
                language={file.language}
              />
            ))}
          </div>
        ) : (
          <div className="ghost-card text-center py-10 text-xs text-zinc-400">
            No generated artifacts found in this category for job {jobId}.
          </div>
        )}
      </div>
    </div>
  );
}
