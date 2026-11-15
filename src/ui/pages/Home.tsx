import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FileUpload from '../components/FileUpload';

type TargetStack = 'typescript' | 'python' | 'go';
type SourceLanguage = 'php' | 'asp' | 'vb6' | 'cobol' | 'delphi';
type InputMode = 'upload' | 'paste';

interface StagedFile {
  name: string;
  content: string;
  language: string;
}

interface SampleFile {
  name: string;
  language: string;
  content: string;
}

interface HealthConfig {
  llmProvider: 'bedrock' | 'openai' | 'none';
  llmConfigured: boolean;
  githubConfigured: boolean;
}

interface RecentJob {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  input?: {
    files: Array<{ name: string; language: string }>;
    targetStack: string;
  };
}

const LANG_LABELS: Record<SourceLanguage, string> = {
  php: 'PHP 4/5',
  asp: 'Classic ASP (VBScript)',
  vb6: 'Visual Basic 6',
  cobol: 'COBOL',
  delphi: 'Delphi / Pascal'
};

const STACK_LABELS: Record<TargetStack, string> = {
  typescript: 'TypeScript / Node.js',
  python: 'Python 3',
  go: 'Go'
};

const EXT_TO_LANG: Record<string, SourceLanguage> = {
  '.php': 'php',
  '.asp': 'asp',
  '.bas': 'vb6',
  '.vb': 'vb6',
  '.cbl': 'cobol',
  '.cob': 'cobol',
  '.pas': 'delphi',
  '.dpr': 'delphi'
};

const DEFAULT_EXT_FOR_LANG: Record<SourceLanguage, string> = {
  php: '.php',
  asp: '.asp',
  vb6: '.bas',
  cobol: '.cbl',
  delphi: '.pas'
};

function inferLanguageFromName(filename: string, fallback: SourceLanguage): SourceLanguage {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) return fallback;
  const ext = filename.slice(dotIdx).toLowerCase();
  return EXT_TO_LANG[ext] ?? fallback;
}

function formatBytes(text: string): string {
  const bytes = new Blob([text]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function Home() {
  const navigate = useNavigate();
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('php');
  const [targetStack, setTargetStack] = useState<TargetStack>('typescript');
  const [pastedFilename, setPastedFilename] = useState('legacy_module.php');
  const [pastedCode, setPastedCode] = useState('');
  const [pushToGithub, setPushToGithub] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [healthConfig, setHealthConfig] = useState<HealthConfig | null>(null);
  const [samples, setSamples] = useState<SampleFile[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((res: { data?: { config?: HealthConfig } }) => {
        if (res.data?.config) {
          setHealthConfig(res.data.config);
        }
      })
      .catch(() => undefined);

    fetch('/api/jobs/samples')
      .then((r) => r.json())
      .then((res: { data?: SampleFile[] }) => {
        if (Array.isArray(res.data)) {
          setSamples(res.data);
        }
      })
      .catch(() => undefined);

    fetch('/api/jobs')
      .then((r) => r.json())
      .then((res: { data?: RecentJob[] }) => {
        if (Array.isArray(res.data)) {
          setRecentJobs(res.data.slice(0, 6));
        }
      })
      .catch(() => undefined);
  }, []);

  const handleFilesAdded = async (newFiles: File[]) => {
    setError('');
    const parsed: StagedFile[] = await Promise.all(
      newFiles.map(async (f) => ({
        name: f.name,
        content: await f.text(),
        language: inferLanguageFromName(f.name, sourceLanguage)
      }))
    );

    setStagedFiles((prev) => [...prev, ...parsed].slice(0, 10));
  };

  const handleAddPastedCode = () => {
    if (!pastedCode.trim()) {
      setError('Please paste legacy code before adding.');
      return;
    }
    if (new Blob([pastedCode]).size > 500 * 1024) {
      setError('Pasted code exceeds the 500KB limit.');
      return;
    }

    const name =
      pastedFilename.trim() || `legacy_snippet${DEFAULT_EXT_FOR_LANG[sourceLanguage]}`;
    const lang = inferLanguageFromName(name, sourceLanguage);

    setStagedFiles((prev) => [...prev, { name, content: pastedCode, language: lang }].slice(0, 10));
    setPastedCode('');
    setError('');
  };

  const handleLoadSample = (sample: SampleFile) => {
    setError('');
    setStagedFiles((prev) => {
      const exists = prev.some((f) => f.name === sample.name);
      if (exists) return prev;
      return [...prev, { name: sample.name, content: sample.content, language: sample.language }].slice(
        0,
        10
      );
    });
    if (sample.language in LANG_LABELS) {
      setSourceLanguage(sample.language as SourceLanguage);
    }
  };

  const handleRemoveStaged = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSourceLanguageChange = (newLang: SourceLanguage) => {
    setSourceLanguage(newLang);
    if (!pastedCode.trim()) {
      setPastedFilename(`legacy_module${DEFAULT_EXT_FOR_LANG[newLang]}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let filesToSubmit = [...stagedFiles];
    if (inputMode === 'paste' && pastedCode.trim()) {
      if (new Blob([pastedCode]).size > 500 * 1024) {
        setError('Pasted code exceeds the 500KB limit.');
        return;
      }
      const name =
        pastedFilename.trim() || `legacy_snippet${DEFAULT_EXT_FOR_LANG[sourceLanguage]}`;
      const lang = inferLanguageFromName(name, sourceLanguage);
      filesToSubmit = [...filesToSubmit, { name, content: pastedCode, language: lang }].slice(0, 10);
    }

    if (filesToSubmit.length === 0) {
      setError('Please upload, paste, or load a legacy code sample first.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const body = {
        files: filesToSubmit,
        targetStack,
        pushToGithub,
        githubRepo: pushToGithub && githubRepo.trim() ? githubRepo.trim() : undefined
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: unknown };
        const msg =
          typeof data.error === 'string'
            ? data.error
            : JSON.stringify(data.error ?? 'Failed to create job');
        throw new Error(msg);
      }

      const data = (await res.json()) as { data: { jobId: string } };
      navigate(`/pipeline/${data.data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const hasSubmitData = stagedFiles.length > 0 || (inputMode === 'paste' && pastedCode.trim().length > 0);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4 pt-6">
        <h1 className="text-6xl font-bold specter-glow">👻 GhostLink</h1>
        <p className="text-2xl text-purple-300">Raise your legacy code from the dead</p>
        <p className="text-bone-dim text-sm max-w-lg mx-auto">
          Multi-agent AI pipeline: archaeology → documentation → modernization → tests → deployment
        </p>
      </div>

      {/* Environment Config Banner */}
      {healthConfig && !healthConfig.llmConfigured && (
        <div className="bg-amber-950/60 border border-amber-600 rounded-xl px-5 py-4 text-amber-200 text-sm space-y-1">
          <p className="font-bold">⚠️ LLM Credentials Required</p>
          <p>
            No LLM provider is configured on the server. Add{' '}
            <code className="text-amber-100 bg-amber-900/60 px-1.5 py-0.5 rounded">
              AWS_ACCESS_KEY_ID
            </code>{' '}
            +{' '}
            <code className="text-amber-100 bg-amber-900/60 px-1.5 py-0.5 rounded">
              AWS_SECRET_ACCESS_KEY
            </code>{' '}
            (for AWS Bedrock) or{' '}
            <code className="text-amber-100 bg-amber-900/60 px-1.5 py-0.5 rounded">
              OPENAI_API_KEY
            </code>{' '}
            (for OpenAI) to your <code className="text-amber-100">.env</code> file before starting a
            job.
          </p>
        </div>
      )}

      {healthConfig && healthConfig.llmConfigured && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
          <span className="px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-700 text-emerald-300">
            ⚡ LLM Active: {healthConfig.llmProvider === 'bedrock' ? 'AWS Bedrock' : 'DeepSeek / OpenAI'}
          </span>
          <span
            className={`px-3 py-1 rounded-full border ${
              healthConfig.githubConfigured
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                : 'bg-purple-950/60 border-purple-700 text-purple-400'
            }`}
          >
            🐙 GitHub MCP: {healthConfig.githubConfigured ? 'Token Configured' : 'Token Optional / Per-Push'}
          </span>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="ghost-card space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-purple-200">🧟 Legacy Code Input</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                inputMode === 'upload'
                  ? 'bg-purple-700 text-white'
                  : 'bg-purple-900/50 text-purple-400 hover:text-white'
              }`}
            >
              📂 Upload Files
            </button>
            <button
              type="button"
              onClick={() => setInputMode('paste')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                inputMode === 'paste'
                  ? 'bg-purple-700 text-white'
                  : 'bg-purple-900/50 text-purple-400 hover:text-white'
              }`}
            >
              📝 Paste Code
            </button>
          </div>
        </div>

        {/* One-Click Sample Loader */}
        {samples.length > 0 && (
          <div className="bg-purple-900/30 border border-purple-800 rounded-lg p-3 space-y-2">
            <p className="text-xs text-purple-300 font-medium">
              ⚡ Load Legacy Sample from Disk:
            </p>
            <div className="flex flex-wrap gap-2">
              {samples.map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => handleLoadSample(sample)}
                  className="text-xs px-3 py-1.5 rounded-md bg-purple-900 hover:bg-purple-700 text-purple-200 border border-purple-600 transition-colors"
                >
                  + {sample.name} ({sample.language.toUpperCase()})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Upload or Paste */}
        {inputMode === 'upload' ? (
          <FileUpload
            hideFileList
            onFilesAdded={(files) => {
              void handleFilesAdded(files);
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={pastedFilename}
                onChange={(e) => setPastedFilename(e.target.value)}
                placeholder="Filename (e.g. legacy_cart.php)"
                className="ghost-input flex-1 text-sm"
                aria-label="Pasted file name"
              />
              <button
                type="button"
                onClick={handleAddPastedCode}
                className="ghost-btn text-sm py-2 px-4 shrink-0"
              >
                + Add Code to Queue
              </button>
            </div>
            <textarea
              value={pastedCode}
              onChange={(e) => setPastedCode(e.target.value)}
              rows={10}
              placeholder="Paste legacy PHP 4/5, Classic ASP, VB6, COBOL, or Delphi code here..."
              className="ghost-input w-full font-mono text-xs leading-relaxed"
              aria-label="Legacy source code input"
            />
          </div>
        )}

        {/* Unified Staged Files Queue */}
        {stagedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-purple-300">
              {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} staged (max 10):
            </p>
            {stagedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between bg-purple-900/40 border border-purple-700 rounded-lg px-4 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-purple-300">📄</span>
                  <span className="text-white truncate font-mono">{file.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-800 text-purple-200 uppercase">
                    {file.language}
                  </span>
                  <span className="text-purple-400 text-xs shrink-0">
                    {formatBytes(file.content)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveStaged(idx)}
                  className="text-red-400 hover:text-red-300 ml-2 shrink-0"
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-purple-300">
              Default Source Language (for pasted / unknown extensions)
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => handleSourceLanguageChange(e.target.value as SourceLanguage)}
              className="ghost-input w-full"
            >
              {(Object.keys(LANG_LABELS) as SourceLanguage[]).map((lang) => (
                <option key={lang} value={lang}>
                  {LANG_LABELS[lang]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-purple-300">Target Stack</label>
            <select
              value={targetStack}
              onChange={(e) => setTargetStack(e.target.value as TargetStack)}
              className="ghost-input w-full"
            >
              {(Object.keys(STACK_LABELS) as TargetStack[]).map((stack) => (
                <option key={stack} value={stack}>
                  {STACK_LABELS[stack]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* GitHub toggle */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                pushToGithub ? 'bg-emerald-600' : 'bg-purple-800'
              }`}
              onClick={() => setPushToGithub((v) => !v)}
              role="checkbox"
              aria-checked={pushToGithub}
              tabIndex={0}
              onKeyDown={(e) => e.key === ' ' && setPushToGithub((v) => !v)}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                  pushToGithub ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </div>
            <span className="text-sm text-purple-300">🐙 Auto-push to GitHub via MCP when done</span>
          </label>

          {pushToGithub && (
            <input
              type="text"
              placeholder="GitHub repository name (e.g. my-modernized-app)"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              className="ghost-input w-full"
            />
          )}
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !hasSubmitData}
          className="ghost-btn-green w-full text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '🌀 Summoning pipeline...' : '⚡ Modernize Code'}
        </button>
      </form>

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <div className="ghost-card space-y-4">
          <h2 className="text-lg font-bold text-purple-200">📜 Recent Modernization Jobs</h2>
          <div className="space-y-2">
            {recentJobs.map((job) => {
              const targetUrl =
                job.status === 'completed' ? `/results/${job.jobId}` : `/pipeline/${job.jobId}`;
              const fileNames = job.input?.files?.map((f) => f.name).join(', ') || 'Legacy files';
              return (
                <Link
                  key={job.jobId}
                  to={targetUrl}
                  className="flex flex-wrap items-center justify-between gap-2 bg-purple-900/30 hover:bg-purple-900/60 border border-purple-800 rounded-lg px-4 py-3 text-sm transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-white font-mono truncate">{fileNames}</p>
                    <p className="text-xs text-purple-400">
                      {job.input?.targetStack ? `→ ${job.input.targetStack} · ` : ''}
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      job.status === 'completed'
                        ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                        : job.status === 'failed'
                        ? 'bg-red-900/60 text-red-300 border border-red-700'
                        : 'bg-purple-800 text-purple-200 border border-purple-600'
                    }`}
                  >
                    {job.status}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: '🏺',
            title: 'Archaeology Agent',
            desc: 'Extracts business rules, functions, and side effects from legacy code'
          },
          {
            icon: '📜',
            title: 'Documentation Agent',
            desc: 'Generates living docs and Mermaid data flow diagrams'
          },
          {
            icon: '⚗️',
            title: 'Modernizer Agent',
            desc: 'Rewrites to TypeScript, Python, or Go with annotated decisions'
          },
          {
            icon: '🧪',
            title: 'Test Agent',
            desc: 'Property-based tests with fast-check or hypothesis'
          },
          {
            icon: '🚀',
            title: 'Deploy Agent',
            desc: 'Dockerfile, docker-compose, and GitHub Actions CI'
          },
          {
            icon: '🐙',
            title: 'GitHub MCP',
            desc: 'Auto-creates repo and opens PR with decision log'
          }
        ].map(({ icon, title, desc }) => (
          <div key={title} className="ghost-card text-center space-y-2">
            <div className="text-3xl">{icon}</div>
            <h3 className="font-bold text-purple-200 text-sm">{title}</h3>
            <p className="text-xs text-purple-400">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
