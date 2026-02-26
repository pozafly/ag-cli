import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

import { askModel } from './llm.js';
import { browserResearch } from './browser.js';
import { runWorkerTask } from './workers.js';
import { resolveApiKey, ensureDir } from './config.js';

const SYSTEM_PROMPT = `You are an autonomous software orchestrator inspired by agent-first IDEs.
Return concise, actionable output.
When planning: produce numbered task groups.
When executing: report completed, failed, next actions.`;

function inferAssignee(goal, defaultWorker = 'codex') {
  const text = goal.toLowerCase();
  if (text.includes('browser') || text.includes('웹') || text.includes('사이트') || text.includes('url')) {
    return 'browser';
  }
  if (text.includes('claude')) return 'claude';
  if (text.includes('codex')) return 'codex';
  return defaultWorker;
}

function extractUrl(goal) {
  const match = goal.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

export async function plan(objective, config) {
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

  const tasks = lines.map((goal, idx) => ({
    id: `TG-${idx + 1}`,
    goal,
    status: 'pending',
    assignee: inferAssignee(goal, config.worker?.defaultWorker || 'codex'),
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

function findRiskyKeyword(goal, config) {
  const list = config.approval?.riskyKeywords || [];
  const text = goal.toLowerCase();
  return list.find((k) => text.includes(String(k).toLowerCase())) || null;
}

async function executeTask(task, config, options = {}) {
  const startedAt = new Date().toISOString();

  if (config.approval?.enabled) {
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

    const data = await browserResearch(url, {
      headless: config.browser.headless,
      slowMoMs: config.browser.slowMoMs
    });

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

export async function executeTaskGroups(state, config, options = {}) {
  const queue = [...state.tasks];
  const poolSize = Math.max(1, Number(config.worker?.poolSize || 1));
  const running = new Set();
  const completed = [];

  const launchOne = async (task) => {
    const p = executeTask(task, config, options)
      .then((result) => completed.push(result))
      .finally(() => running.delete(p));
    running.add(p);
  };

  while (queue.length || running.size) {
    while (queue.length && running.size < poolSize) {
      await launchOne(queue.shift());
    }
    if (running.size) {
      await Promise.race(running);
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

export async function runBrowserSubagent(url, config) {
  const data = await browserResearch(url, {
    headless: config.browser.headless,
    slowMoMs: config.browser.slowMoMs
  });

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

export async function delegateTaskToWorker({ worker, prompt, timeoutMs = 120000 }, config) {
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

function safeExec(command, options = {}) {
  try {
    return {
      ok: true,
      output: execSync(command, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
      }).trim()
    };
  } catch (err) {
    return {
      ok: false,
      output: String(err.stdout || err.stderr || err.message || '').trim()
    };
  }
}

export function createReviewArtifact(state, config) {
  const outDir = ensureDir(config.artifactsDir);
  const now = new Date().toISOString();
  const diff = safeExec('git diff -- .');
  const status = safeExec('git status --short');
  const test = safeExec(config.review?.testCommand || 'npm test --silent');

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
    `- command: ${config.review?.testCommand || 'npm test --silent'}`,
    `- success: ${test.ok}`,
    '```',
    test.output || '(no output)',
    '```',
    '',
    '## Diff (truncated)',
    '```diff',
    (diff.output || '(no diff)').slice(0, Number(config.review?.maxDiffChars || 12000)),
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

export function saveState(state, config, suffix = '') {
  const outDir = ensureDir(config.artifactsDir);
  const tail = suffix ? `-${suffix}` : '';
  const fullPath = path.join(outDir, `run-${state.sessionId}${tail}.json`);
  fs.writeFileSync(fullPath, JSON.stringify(state, null, 2), 'utf8');
  return fullPath;
}
