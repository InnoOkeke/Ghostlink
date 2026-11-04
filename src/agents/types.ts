export interface AgentContext {
  jobId: string;
  outputDir: string;
  onProgress: (message: string, percent: number) => void;
}

export interface AgentResult<T> {
  success: boolean;
  output?: T;
  error?: string;
  durationMs: number;
}

export interface Agent<TInput, TOutput> {
  name: string;
  description: string;
  run(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

export interface LegacyCodeInput {
  files: Array<{ name: string; content: string; language: string }>;
  targetStack: 'typescript' | 'python' | 'go';
  pushToGithub?: boolean;
  githubRepo?: string;
}

export interface CodeMap {
  functions: Array<{
    name: string;
    signature: string;
    lineStart: number;
    lineEnd: number;
    description: string;
  }>;
  globals: string[];
  sideEffects: string[];
  dbCalls: string[];
  externalDeps: string[];
  businessRules: string[];
}

export interface JobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: StepStatus[];
  createdAt: string;
  completedAt?: string;
  outputDir: string;
  input?: LegacyCodeInput;
}

export interface StepStatus {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt?: string;
  completedAt?: string;
  progress: number;
  message: string;
}
