import React, { useCallback, useState } from 'react';

interface FileUploadProps {
  onFilesChange?: (files: File[]) => void;
  onFilesAdded?: (files: File[]) => void;
  hideFileList?: boolean;
}

const MAX_FILE_SIZE = 500 * 1024; // 500KB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({
  onFilesChange,
  onFilesAdded,
  hideFileList = false
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const processFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles) return;

      const validFiles: File[] = [];
      const newErrors: string[] = [];

      Array.from(newFiles).forEach((file) => {
        if (file.size > MAX_FILE_SIZE) {
          newErrors.push(`${file.name}: exceeds 500KB limit (${formatBytes(file.size)})`);
        } else {
          validFiles.push(file);
        }
      });

      setErrors(newErrors);
      if (validFiles.length > 0) {
        onFilesAdded?.(validFiles);
      }
      const merged = [...files, ...validFiles].slice(0, 10);
      setFiles(merged);
      onFilesChange?.(merged);
    },
    [files, onFilesAdded, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onFilesChange?.(updated);
  };

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`group border border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer ${
          dragOver
            ? 'border-indigo-400/70 bg-indigo-500/10 shadow-lg shadow-indigo-950/30'
            : 'border-white/[0.14] hover:border-indigo-400/50 bg-zinc-950/50 hover:bg-zinc-900/50'
        }`}
        role="button"
        aria-label="Upload legacy code files"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            document.getElementById('file-input')?.click();
          }
        }}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".php,.asp,.bas,.vb,.cls,.frm,.cbl,.cob,.cpy,.pas,.dpr,.c,.h,.cpp,.cc,.cxx,.hpp,.cs,.f,.for,.f77,.f90,.f95,.pl,.pm,.txt"
          className="hidden"
          onChange={handleFileInput}
          aria-label="File input"
        />

        <div className="mx-auto mb-3.5 w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-300 group-hover:text-white group-hover:border-white/[0.15] transition-colors">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <p className="text-sm font-medium text-zinc-100">
          {dragOver ? 'Drop legacy files to stage' : 'Drag and drop source files, or click to browse'}
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          Up to 10 files · Max 500 KB per file
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {[
            '.php',
            '.asp',
            '.bas',
            '.vb',
            '.cbl',
            '.cob',
            '.pas',
            '.dpr',
            '.c',
            '.cpp',
            '.h',
            '.cs',
            '.f90',
            '.f',
            '.pl'
          ].map((ext) => (
            <span
              key={ext}
              className="px-2 py-0.5 rounded-md text-[11px] font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.06]"
            >
              {ext}
            </span>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-red-950/40 border border-red-500/30 p-3">
          {errors.map((err) => (
            <div key={err} className="flex items-center gap-2 text-red-300 text-xs">
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {!hideFileList && files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400">
            {files.length} file{files.length !== 1 ? 's' : ''} ready
          </p>
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between bg-zinc-950/60 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="text-zinc-100 font-mono text-xs truncate">{file.name}</span>
                <span className="text-zinc-500 text-xs shrink-0">{formatBytes(file.size)}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(idx);
                }}
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
      )}
    </div>
  );
}
