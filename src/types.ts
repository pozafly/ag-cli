export type WorkerName = 'codex' | 'claude' | 'browser' | (string & {});

export interface WorkerConfig {
  poolSize: number;
  timeoutMs: number;
  defaultWorker: WorkerName;
  maxRetries: number;
  retryBackoffMs: number;
}

export interface ApprovalConfig {
  enabled: boolean;
  strategy: 'prompt' | string;
  riskyKeywords: string[];
}

export interface ReviewConfig {
  testCommand: string;
  maxDiffChars: number;
}

export interface BrowserConfig {
  headless: boolean;
  slowMoMs: number;
}

export interface ManagerConfig {
  routingStrategy: 'heuristic' | 'llm-hybrid' | string;
}

export interface AppConfig {
  model: string;
  endpoint: string | null;
  apiKeyEnv: string;
  artifactsDir: string;
  worker: WorkerConfig;
  approval: ApprovalConfig;
  review: ReviewConfig;
  browser: BrowserConfig;
  manager: ManagerConfig;
}

export type TaskStatus = 'pending' | 'done' | 'failed' | 'blocked';

export interface TaskApproval {
  required: boolean;
  reason: string;
}

export interface WorkerRunResult {
  code: number;
  stdout: string;
  stderr: string;
  killedByTimeout: boolean;
}

export interface TaskResultWorker {
  kind: 'worker';
  worker: WorkerName;
  exitCode: number;
  killedByTimeout: boolean;
  stdout: string;
  stderr: string;
  attempts?: number;
}

export interface TaskResultBrowser {
  kind: 'browser';
  title: string;
  url: string;
  links: string[];
}

export type TaskResult = TaskResultWorker | TaskResultBrowser;

export interface TaskGroup {
  id: string;
  goal: string;
  status: TaskStatus;
  assignee: WorkerName;
  notes: string[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  approval?: TaskApproval;
  result?: TaskResult;
}

export interface BrowserResearchResult {
  url: string;
  title: string;
  text: string;
  links: string[];
}

export type ArtifactKind = 'browser-research' | 'worker-run' | 'review-artifact' | 'cross-surface-check';

export interface Artifact {
  kind: ArtifactKind;
  title?: string;
  path: string;
  summary: string;
}

export type RunMode = 'planning' | 'execution';

export interface RunState {
  sessionId: string;
  objective: string;
  model: string;
  mode: RunMode;
  tasks: TaskGroup[];
  artifacts: Artifact[];
  latestOutput: string;
}

export interface ExecuteOptions {
  approveRisky?: boolean;
}
