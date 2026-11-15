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
  archaeology: '🏺 Archaeology',
  documentation: '📜 Documentation',
  modernized: '⚗️ Modernized Code',
  tests: '🧪 Tests',
  deploy: '🚀 Deploy Files'
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
      <div className="text-center py-20 text-purple-400">
        <div className="text-4xl animate-spin inline-block">🌀</div>
        <p className="mt-4">Loading generated artifacts...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ghost-card border-red-700 bg-red-950/40 text-center space-y-4">
        <p className="text-3xl">💀</p>
        <h1 className="text-xl font-bold text-red-300">Unable to load job results</h1>
        <p className="text-sm text-red-200">{loadError}</p>
        <Link to="/" className="ghost-btn inline-block">
          ← Back to Home
        </Link>
      </div>
    );
  }

  const activeFiles: ArtifactItem[] = artifacts ? artifacts[activeTab] : [];
  const originalFiles: ArtifactItem[] = artifacts ? artifacts.original : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="ghost-card text-center space-y-3">
        <div className="text-4xl">💀</div>
        <h1 className="text-3xl font-bold specter-glow">Your code has been resurrected!</h1>
        <p className="text-purple-400 text-sm">
          Job <span className="font-mono text-purple-300">{jobId}</span>
          {job?.input?.targetStack && <> · Target: {job.input.targetStack}</>}
          {job?.completedAt && <> — completed {new Date(job.completedAt).toLocaleString()}</>}
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button onClick={handleDownload} className="ghost-btn">
            ⬇️ Download ZIP
          </button>
          <button
            onClick={() => setGithubPanelOpen((v) => !v)}
            disabled={githubLoading}
            className="ghost-btn-green disabled:opacity-50"
          >
            🐙 Push to GitHub
          </button>
          <Link to="/" className="ghost-btn">
            👻 New Job
          </Link>
        </div>

        {/* GitHub MCP Push Form */}
        {githubPanelOpen && (
          <form
            onSubmit={(e) => {
              void handleGithubPush(e);
            }}
            className="mt-4 p-4 bg-purple-900/40 border border-purple-700 rounded-xl text-left max-w-xl mx-auto space-y-3"
          >
            <h3 className="text-sm font-bold text-purple-200">
              🐙 Push Modernized Repository via GitHub MCP
            </h3>
            <div className="space-y-1">
              <label className="block text-xs text-purple-300">Repository Name</label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="my-modernized-app"
                className="ghost-input w-full text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-purple-300">
                GitHub Personal Access Token (optional if GITHUB_TOKEN is set in .env)
              </label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_... (leave blank to use server .env token)"
                className="ghost-input w-full text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGithubPanelOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg bg-purple-950 text-purple-300 border border-purple-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={githubLoading}
                className="ghost-btn-green text-xs py-1.5 px-4 disabled:opacity-50"
              >
                {githubLoading ? '🌀 Pushing via MCP...' : 'Create Repo & Open PR'}
              </button>
            </div>
          </form>
        )}

        {githubError && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-700 rounded-lg text-sm text-red-200 max-w-2xl mx-auto">
            ⚠️ GitHub MCP Error: {githubError}
          </div>
        )}

        {githubResult && (
          <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-700 rounded-lg text-sm space-y-1 max-w-2xl mx-auto">
            {githubResult.repoUrl && (
              <p>
                📦 Repo:{' '}
                <a
                  href={githubResult.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  {githubResult.repoUrl}
                </a>
              </p>
            )}
            {githubResult.prUrl && (
              <p>
                🔀 PR:{' '}
                <a
                  href={githubResult.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  {githubResult.prUrl}
                </a>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Pipeline summary */}
      {job && (
        <div className="ghost-card space-y-2">
          <h2 className="text-sm font-bold text-purple-300">Pipeline Steps</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {job.steps.map((step) => (
              <div key={step.name} className="text-center">
                <div className="text-lg">
                  {step.status === 'done' ? '✅' : step.status === 'error' ? '💀' : '⏳'}
                </div>
                <div className="text-xs text-purple-400 mt-1">
                  {step.name.replace('Agent', '')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
              const count = artifacts ? artifacts[tab].length : 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-purple-700 text-white'
                      : 'bg-purple-950 text-purple-400 hover:bg-purple-800 hover:text-white'
                  }`}
                >
                  {TAB_LABELS[tab]} ({count})
                </button>
              );
            })}
          </div>

          {activeTab === 'modernized' && originalFiles.length > 0 && (
            <button
              type="button"
              onClick={() => setCompareSideBySide((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                compareSideBySide
                  ? 'bg-emerald-900/60 border-emerald-500 text-emerald-200'
                  : 'bg-purple-950 border-purple-700 text-purple-300 hover:border-purple-500'
              }`}
            >
              {compareSideBySide ? '⇄ Side-by-Side Compare: ON' : '⇄ Compare with Legacy Original'}
            </button>
          )}
        </div>

        {/* Content */}
        {activeTab === 'modernized' && compareSideBySide ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-purple-300">🦴 Original Legacy Source</h3>
              {originalFiles.map((file) => (
                <CodeViewer
                  key={file.relativePath}
                  filename={file.relativePath}
                  code={file.content}
                  language={file.language}
                />
              ))}
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-300">⚗️ Modernized Output & Decisions</h3>
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
          <div className="ghost-card text-center py-8 text-sm text-purple-400">
            No generated artifacts found in this category for job {jobId}.
          </div>
        )}
      </div>
    </div>
  );
}
