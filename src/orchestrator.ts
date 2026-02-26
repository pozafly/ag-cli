import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

import { askModel } from './llm.js';
import { browserResearch } from './browser.js';
import { runWorkerTask } from './workers.js';
import { resolveApiKey, ensureDir } from './config.js';
import { findRiskyKeyword } from './risk.js';
import type {
  AppConfig,
  Artifact,
  BrowserResearchResult,
  ExecuteOptions,
  RunState,
  TaskGroup,
  WorkerName
} from './types.js';

const SYSTEM_PROMPT = `You are an autonomous software orchestrator inspired by agent-first IDEs.
Return concise, actionable output.
When planning: produce numbered task groups.
When executing: report completed, failed, next actions.`;

function inferAssignee(goal: string, defaultWorker: WorkerName = 'codex'): WorkerName {
  const text = goal.toLowerCase();
  if (text.includes('browser') || text.includes('웹') || text.includes('사이트') || text.includes('url')) {
    return 'browser';
  }
  if (text.includes('claude')) return 'claude';
  if (text.includes('codex')) return 'codex';
  return defaultWorker;
}

function extractUrl(goal: string): string | null {
  const match = goal.match(/https?:\/\/\S+/i);
  return match?.[0] ?? null;
}

export async function plan(objective: string, config: AppConfig): Promise<RunState> {
  const sessionId = randomUUID().slice(0, 8);
  const apiKey = resolveApiKey(config);

  const output = await askModel({
    apiKey,
    model: config.model,
    endpoint: config.endpoint,
    prompt: `${SYSTEM_PROMPT}\n\nObjective: ${objective}\nCreate task groups with assignee hints.`
  });

  const lines = output
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);

  const tasks: TaskGroup[] = lines.map((goal, idx) => ({
    id: `TG-${idx + 1}`,
    goal,
    status: 'pending',
    assignee: inferAssignee(goal, config.worker.defaultWorker),
    notes: []
  }));

  return {
    sessionId,
    objective,
    model: config.model,
    mode: 'planning',
    tasks,
    artifacts: [],
    latestOutput: output
  };
}

async function executeTask(task: TaskGroup, config: AppConfig, options: ExecuteOptions = {}): Promise<TaskGroup> {
  const startedAt = new Date().toISOString();

  if (config.approval.enabled) {
    const risky = findRiskyKeyword(task.goal, config);
    if (risky && !options.approveRisky) {
      return {
        ...task,
        status: 'blocked',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: `요청 승인 필요: 위험 키워드(${risky}) 감지`,
        approval: {
          required: true,
          reason: `risky-keyword:${risky}`
        }
      };
    }
  }

  if (task.assignee === 'browser') {
    const url = extractUrl(task.goal);
    if (!url) {
      return {
        ...task,
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: 'browser 태스크에 URL이 없어 실행할 수 없습니다.'
      };
    }

    const data = await browserResearch(url, config.browser);

    return {
      ...task,
      status: 'done',
      startedAt,
      finishedAt: new Date().toISOString(),
      result: {
        kind: 'browser',
        title: data.title,
        url,
        links: data.links.slice(0, 10)
      }
    };
  }

  const result = await runWorkerTask({
    worker: task.assignee,
    prompt: task.goal,
    timeoutMs: config.worker.timeoutMs
  });

  const success = result.code === 0 && !result.killedByTimeout;
  return {
    ...task,
    status: success ? 'done' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    result: {
      kind: 'worker',
      worker: task.assignee,
      exitCode: result.code,
      killedByTimeout: result.killedByTimeout,
      stdout: result.stdout,
      stderr: result.stderr
    }
  };
}

export async function executeTaskGroups(state: RunState, config: AppConfig, options: ExecuteOptions = {}): Promise<RunState> {
  const queue: TaskGroup[] = [...state.tasks];
  const poolSize = Math.max(1, config.worker.poolSize);
  const running = new Set<Promise<void>>();
  const completed: TaskGroup[] = [];

  const launchOne = (task: TaskGroup): void => {
    const p = executeTask(task, config, options)
      .then((result) => {
        completed.push(result);
      })
      .finally(() => {
        running.delete(p);
      });
    running.add(p);
  };

  while (queue.length > 0 || running.size > 0) {
    while (queue.length > 0 && running.size < poolSize) {
      const task = queue.shift();
      if (task) launchOne(task);
    }
    if (running.size > 0) {
      await Promise.race([...running]);
    }
  }

  return {
    ...state,
    mode: 'execution',
    tasks: completed.sort((a, b) => a.id.localeCompare(b.id)),
    latestOutput: JSON.stringify(
      completed.map((t) => ({ id: t.id, assignee: t.assignee, status: t.status })),
      null,
      2
    )
  };
}

export async function runBrowserSubagent(url: string, config: AppConfig): Promise<Artifact> {
  const data: BrowserResearchResult = await browserResearch(url, config.browser);

  const outDir = ensureDir(config.artifactsDir);
  const filename = `browser-research-${Date.now()}.json`;
  const fullPath = path.join(outDir, filename);

  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');

  return {
    kind: 'browser-research',
    title: `Research: ${data.title}`,
    path: fullPath,
    summary: `Captured ${data.links.length} links from ${url}`
  };
}

interface DelegateArgs {
  worker: WorkerName;
  prompt: string;
  timeoutMs?: number;
}

export async function delegateTaskToWorker({ worker, prompt, timeoutMs = 120000 }: DelegateArgs, config: AppConfig): Promise<Artifact> {
  const result = await runWorkerTask({ worker, prompt, timeoutMs });
  const outDir = ensureDir(config.artifactsDir);
  const fullPath = path.join(outDir, `worker-${worker}-${Date.now()}.json`);

  const payload = {
    worker,
    prompt,
    timeoutMs,
    exitCode: result.code,
    killedByTimeout: result.killedByTimeout,
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.code === 0 && !result.killedByTimeout
  };

  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8');
  return {
    kind: 'worker-run',
    title: `${worker} 워커 실행 결과`,
    path: fullPath,
    summary: `exit=${payload.exitCode}, timeout=${payload.killedByTimeout}`
  };
}

interface ExecResult {
  ok: boolean;
  output: string;
}

function safeExec(command: string, options: Parameters<typeof execSync>[1] = {}): ExecResult {
  try {
    return {
      ok: true,
      output: String(
        execSync(command, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          ...options
        })
      ).trim()
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: String(e.stdout ?? e.stderr ?? e.message ?? '').trim()
    };
  }
}

export function createReviewArtifact(state: RunState, config: AppConfig): Artifact {
  const outDir = ensureDir(config.artifactsDir);
  const now = new Date().toISOString();
  const diff = safeExec('git diff -- .');
  const status = safeExec('git status --short');
  const testCommand = config.review.testCommand || 'npm test --silent';
  const test = safeExec(testCommand);

  const markdown = [
    '# Review Artifact',
    '',
    `- sessionId: ${state.sessionId}`,
    `- generatedAt: ${now}`,
    '',
    '## Task Summary',
    ...state.tasks.map((t) => `- ${t.id} [${t.assignee}] ${t.status} :: ${t.goal}`),
    '',
    '## Git Status',
    '```',
    status.output || '(clean)',
    '```',
    '',
    '## Test Result',
    `- command: ${testCommand}`,
    `- success: ${test.ok}`,
    '```',
    test.output || '(no output)',
    '```',
    '',
    '## Diff (truncated)',
    '```diff',
    (diff.output || '(no diff)').slice(0, config.review.maxDiffChars),
    '```'
  ].join('\n');

  const fullPath = path.join(outDir, `review-${state.sessionId}.md`);
  fs.writeFileSync(fullPath, markdown, 'utf8');

  return {
    kind: 'review-artifact',
    path: fullPath,
    summary: `review generated (test ok=${test.ok})`
  };
}

export function saveState(state: RunState, config: AppConfig, suffix = ''): string {
  const outDir = ensureDir(config.artifactsDir);
  const tail = suffix ? `-${suffix}` : '';
  const fullPath = path.join(outDir, `run-${state.sessionId}${tail}.json`);
  fs.writeFileSync(fullPath, JSON.stringify(state, null, 2), 'utf8');
  return fullPath;
}
