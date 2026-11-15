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

const ARCHITECTURE_STEPS = [
  {
    code: '01',
    title: 'Archaeology Agent',
    desc: 'Extracts functions, global state, database queries, and hidden business rules.',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    )
  },
  {
    code: '02',
    title: 'Documentation Agent',
    desc: 'Authors architectural documentation and Mermaid data-flow specifications.',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  },
  {
    code: '03',
    title: 'Modernizer Agent',
    desc: 'Translates source into strict TypeScript, Python, or Go with decision logs.',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    )
  },
  {
    code: '04',
    title: 'Test Agent',
    desc: 'Generates fast-check, pytest/hypothesis, or Go property-based test suites.',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    )
  },
  {
    code: '05',
    title: 'Deploy Agent',
    desc: 'Scaffolds production Dockerfiles, compose configs, CI workflows, and guides.',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    )
  },
  {
    code: 'MCP',
    title: 'GitHub MCP',
    desc: 'Creates a repository, commits all generated artifacts, and opens a tracked PR.',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
        <line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    )
  }
];

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

function isDefaultFilename(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx === -1) return trimmed === 'legacy_module' || trimmed === 'legacy_snippet';
  const base = trimmed.slice(0, dotIdx);
  const ext = trimmed.slice(dotIdx);
  return (base === 'legacy_module' || base === 'legacy_snippet') && ext in EXT_TO_LANG;
}

function resolvePastedFile(
  rawName: string,
  content: string,
  selectedLang: SourceLanguage
): StagedFile {
  const trimmed = rawName.trim();
  if (!trimmed || isDefaultFilename(trimmed)) {
    const ext = DEFAULT_EXT_FOR_LANG[selectedLang];
    const base = trimmed.toLowerCase().startsWith('legacy_snippet') ? 'legacy_snippet' : 'legacy_module';
    return {
      name: `${base}${ext}`,
      content,
      language: selectedLang
    };
  }
  return {
    name: trimmed,
    content,
    language: inferLanguageFromName(trimmed, selectedLang)
  };
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

    const file = resolvePastedFile(pastedFilename, pastedCode, sourceLanguage);

    setStagedFiles((prev) => [...prev, file].slice(0, 10));
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
    if (!pastedFilename.trim() || isDefaultFilename(pastedFilename)) {
      setPastedFilename(`legacy_module${DEFAULT_EXT_FOR_LANG[newLang]}`);
    }
    setStagedFiles((prev) =>
      prev.map((f) => (isDefaultFilename(f.name) ? resolvePastedFile(f.name, f.content, newLang) : f))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let filesToSubmit = [...stagedFiles];
    if (inputMode === 'paste' && pastedCode.trim()) {
      if (new Blob([pastedCode]).size > 500 * 1024) {
        setError('Pasted code exceeds the 500KB limit.');
        return;
      }
      const file = resolvePastedFile(pastedFilename, pastedCode, sourceLanguage);
      filesToSubmit = [...filesToSubmit, file].slice(0, 10);
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
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center space-y-5 pt-4 pb-2">
        <div className="flex justify-center">
          <img
            src="/logo.jpg"
            alt="GhostLink"
            className="w-16 h-16 rounded-[22%] object-cover shadow-2xl ring-1 ring-white/15"
          />
        </div>

        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            Multi-Agent Legacy Code Modernization
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight specter-glow max-w-2xl mx-auto leading-[1.1]">
            Bring legacy systems into modern cloud architecture.
          </h1>

          <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Archaeology, living documentation, clean-room rewrites, property-based tests, and deployment scaffolding—orchestrated in five autonomous stages.
          </p>
        </div>

        {healthConfig && healthConfig.llmConfigured && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1 text-xs">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              LLM Engine: {healthConfig.llmProvider === 'bedrock' ? 'AWS Bedrock' : 'DeepSeek / OpenAI'}
            </span>
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                healthConfig.githubConfigured
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  healthConfig.githubConfigured ? 'bg-emerald-400' : 'bg-zinc-500'
                }`}
              />
              GitHub MCP: {healthConfig.githubConfigured ? 'Connected' : 'Optional per Push'}
            </span>
          </div>
        )}
      </section>

      {/* Missing credentials alert */}
      {healthConfig && !healthConfig.llmConfigured && (
        <div className="rounded-2xl bg-amber-950/40 border border-amber-500/30 px-5 py-4 text-amber-200 text-sm space-y-1.5 max-w-4xl mx-auto">
          <p className="font-semibold flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            LLM Credentials Required
          </p>
          <p className="text-amber-200/80 text-xs leading-relaxed">
            No LLM provider is configured on the server. Set{' '}
            <code className="text-amber-100 bg-amber-500/15 px-1.5 py-0.5 rounded">OPENAI_API_KEY</code>{' '}
            (DeepSeek / OpenAI) or AWS Bedrock credentials in your environment variables before running a pipeline.
          </p>
        </div>
      )}

      {/* Main Studio Workspace */}
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="ghost-card max-w-4xl mx-auto space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">
              Legacy Source Input
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Upload legacy files, paste a snippet, or load a bundled benchmark sample.
            </p>
          </div>

          {/* Segmented Control */}
          <div className="inline-flex p-1 rounded-xl bg-zinc-950/90 border border-white/[0.08] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                inputMode === 'upload'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Upload Files
            </button>
            <button
              type="button"
              onClick={() => setInputMode('paste')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                inputMode === 'paste'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Paste Source
            </button>
          </div>
        </div>

        {/* Language & Stack Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Source Language
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => handleSourceLanguageChange(e.target.value as SourceLanguage)}
              className="ghost-input w-full text-sm"
            >
              {(Object.keys(LANG_LABELS) as SourceLanguage[]).map((lang) => (
                <option key={lang} value={lang} className="bg-zinc-900 text-zinc-100">
                  {LANG_LABELS[lang]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Target Cloud Stack
            </label>
            <select
              value={targetStack}
              onChange={(e) => setTargetStack(e.target.value as TargetStack)}
              className="ghost-input w-full text-sm"
            >
              {(Object.keys(STACK_LABELS) as TargetStack[]).map((stack) => (
                <option key={stack} value={stack} className="bg-zinc-900 text-zinc-100">
                  {STACK_LABELS[stack]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* One-Click Sample Loader */}
        {samples.length > 0 && (
          <div className="rounded-xl bg-zinc-950/60 border border-white/[0.07] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">
                Quick-load benchmark sample
              </span>
              <span className="text-[11px] text-zinc-500">Click to stage</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {samples.map((sample) => {
                const alreadyStaged = stagedFiles.some((f) => f.name === sample.name);
                return (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => handleLoadSample(sample)}
                    className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      alreadyStaged
                        ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.08] hover:border-white/[0.16] text-zinc-200'
                    }`}
                  >
                    <span className="font-mono">{sample.name}</span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400">
                      {sample.language}
                    </span>
                  </button>
                );
              })}
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
                className="ghost-input flex-1 text-sm font-mono"
                aria-label="Pasted file name"
              />
              <button
                type="button"
                onClick={handleAddPastedCode}
                className="ghost-btn text-xs shrink-0"
              >
                + Stage Snippet
              </button>
            </div>
            <textarea
              value={pastedCode}
              onChange={(e) => setPastedCode(e.target.value)}
              rows={10}
              placeholder="Paste legacy PHP 4/5, Classic ASP, VB6, COBOL, or Delphi source code..."
              className="ghost-input w-full font-mono text-xs leading-relaxed"
              aria-label="Legacy source code input"
            />
          </div>
        )}

        {/* Unified Staged Files Queue */}
        {stagedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} staged for modernization
              </span>
              <span className="text-zinc-500">Max 10 files</span>
            </div>
            <div className="space-y-2">
              {stagedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between bg-zinc-950/70 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-zinc-100 truncate font-mono text-xs">{file.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300 uppercase tracking-wider">
                      {file.language}
                    </span>
                    <span className="text-zinc-500 text-xs shrink-0">
                      {formatBytes(file.content)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveStaged(idx)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors ml-2 shrink-0"
                    aria-label={`Remove ${file.name}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GitHub MCP Toggle */}
        <div className="rounded-xl bg-zinc-950/60 border border-white/[0.07] p-4 space-y-3">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-medium text-zinc-100 block">
                Push modernized repository via GitHub MCP
              </span>
              <span className="text-xs text-zinc-400">
                Automatically create a new GitHub repository and open a documented Pull Request.
              </span>
            </div>
            <div
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
                pushToGithub ? 'bg-indigo-500' : 'bg-zinc-700'
              }`}
              onClick={() => setPushToGithub((v) => !v)}
              role="checkbox"
              aria-checked={pushToGithub}
              tabIndex={0}
              onKeyDown={(e) => e.key === ' ' && setPushToGithub((v) => !v)}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                  pushToGithub ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>

          {pushToGithub && (
            <input
              type="text"
              placeholder="Repository name (leave blank for automatic unique name)"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              className="ghost-input w-full text-sm font-mono"
            />
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-950/50 border border-red-500/30 px-4 py-3 text-red-200 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !hasSubmitData}
          className="ghost-btn-green w-full py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-zinc-950/30 border-t-zinc-950 animate-spin" />
              <span>Initializing Modernization Pipeline...</span>
            </>
          ) : (
            <>
              <span>Run Modernization Pipeline</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </>
          )}
        </button>
      </form>

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <section className="max-w-4xl mx-auto space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Recent Modernization Runs
            </h2>
            <span className="text-xs text-zinc-500">{recentJobs.length} shown</span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 divide-y divide-white/[0.06] overflow-hidden">
            {recentJobs.map((job) => {
              const targetUrl =
                job.status === 'completed' ? `/results/${job.jobId}` : `/pipeline/${job.jobId}`;
              const fileNames = job.input?.files?.map((f) => f.name).join(', ') || 'Legacy files';
              return (
                <Link
                  key={job.jobId}
                  to={targetUrl}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm text-zinc-100 font-mono truncate">{fileNames}</p>
                    <p className="text-xs text-zinc-500">
                      {job.input?.targetStack ? `Target: ${job.input.targetStack} · ` : ''}
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                        job.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : job.status === 'failed'
                            ? 'bg-red-500/10 text-red-300 border-red-500/20'
                            : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          job.status === 'completed'
                            ? 'bg-emerald-400'
                            : job.status === 'failed'
                              ? 'bg-red-400'
                              : 'bg-indigo-400'
                        }`}
                      />
                      {job.status}
                    </span>
                    <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Bento Architecture Grid */}
      <section className="max-w-4xl mx-auto space-y-4 pb-4">
        <div className="text-center space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Pipeline Architecture
          </h2>
          <p className="text-sm text-zinc-500">
            Five specialized agents followed by automated repository provisioning
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ARCHITECTURE_STEPS.map(({ code, title, desc, icon }) => (
            <div
              key={title}
              className="rounded-2xl bg-zinc-900/40 border border-white/[0.07] hover:border-white/[0.14] p-5 space-y-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-zinc-200">
                  {icon}
                </div>
                <span className="text-[11px] font-mono text-zinc-500">{code}</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
