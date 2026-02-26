import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import type { AppConfig, Artifact, RunState } from './types.js';
import { ensureDir } from './config.js';

interface ExecResult {
  ok: boolean;
  output: string;
}

function safeExec(command: string): ExecResult {
  try {
    const output = String(
      execSync(command, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
    ).trim();
    return { ok: true, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: String(e.stdout ?? e.stderr ?? e.message ?? '').trim() };
  }
}

export function createCrossSurfaceVerificationHook(state: RunState, config: AppConfig): Artifact {
  const outDir = ensureDir(config.artifactsDir);
  const fullPath = path.join(outDir, `cross-surface-${state.sessionId}.md`);

  const workerTasks = state.tasks.filter((t) => t.result?.kind === 'worker');
  const browserTasks = state.tasks.filter((t) => t.result?.kind === 'browser');

  const gitStatus = safeExec('git status --short');
  const test = safeExec(config.review.testCommand || 'npm test --silent');

  const markdown = [
    '# Cross-Surface Verification Hook',
    '',
    `- sessionId: ${state.sessionId}`,
    `- generatedAt: ${new Date().toISOString()}`,
    '',
    '## Surface A: Code/Git',
    `- changed files: ${(gitStatus.output || '').split('\n').filter(Boolean).length}`,
    '```',
    gitStatus.output || '(clean)',
    '```',
    '',
    '## Surface B: Terminal/Worker',
    `- worker task count: ${workerTasks.length}`,
    `- failed worker tasks: ${workerTasks.filter((t) => t.status === 'failed').length}`,
    '',
    '## Surface C: Browser',
    `- browser task count: ${browserTasks.length}`,
    `- collected links: ${browserTasks.reduce((sum, t) => sum + (t.result?.kind === 'browser' ? t.result.links.length : 0), 0)}`,
    '',
    '## Hook Verdict',
    `- testsOk: ${test.ok}`,
    `- runFailed: ${state.tasks.some((t) => t.status === 'failed')}`,
    `- runBlocked: ${state.tasks.some((t) => t.status === 'blocked')}`,
    '```',
    test.output || '(no test output)',
    '```'
  ].join('\n');

  fs.writeFileSync(fullPath, markdown, 'utf8');

  return {
    kind: 'cross-surface-check',
    path: fullPath,
    summary: `cross-surface verification generated (testsOk=${test.ok})`
  };
}
