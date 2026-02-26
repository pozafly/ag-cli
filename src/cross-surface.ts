import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import type { AppConfig, Artifact, RunState } from './types.js';
import { ensureDir } from './config.js';

interface ExecResult {
  ok: boolean;
  output: string;
}

function safeExec(command: string, cwd?: string): ExecResult {
  try {
    const output = String(
      execSync(command, {
        cwd,
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

function detectRepoRoot(): string {
  const result = safeExec('git rev-parse --show-toplevel');
  return result.ok && result.output ? (result.output.split('\n')[0] ?? '').trim() || process.cwd() : process.cwd();
}

export function createCrossSurfaceVerificationHook(state: RunState, config: AppConfig): Artifact {
  const outDir = ensureDir(config.artifactsDir);
  const fullPath = path.join(outDir, `cross-surface-${state.sessionId}.md`);
  const repoRoot = detectRepoRoot();

  const workerTasks = state.tasks.filter((t) => t.result?.kind === 'worker');
  const browserTasks = state.tasks.filter((t) => t.result?.kind === 'browser');
  const blockedTasks = state.tasks.filter((t) => t.status === 'blocked');
  const failedTasks = state.tasks.filter((t) => t.status === 'failed');

  const gitStatus = safeExec('git status --short', repoRoot);
  const test = safeExec(config.review.testCommand || 'npm test --silent', repoRoot);

  const workerAssignmentMismatch = workerTasks.filter((t) => t.result?.kind === 'worker' && t.assignee !== t.result.worker);
  const browserAssignmentMismatch = browserTasks.filter((t) => t.assignee !== 'browser');

  const verdictPassed =
    test.ok && failedTasks.length === 0 && blockedTasks.length === 0 && workerAssignmentMismatch.length === 0 && browserAssignmentMismatch.length === 0;

  const markdown = [
    '# Cross-Surface Verification Hook',
    '',
    `- sessionId: ${state.sessionId}`,
    `- generatedAt: ${new Date().toISOString()}`,
    `- repoRoot: ${repoRoot}`,
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
    `- worker assignment mismatch: ${workerAssignmentMismatch.length}`,
    '',
    '## Surface C: Browser',
    `- browser task count: ${browserTasks.length}`,
    `- collected links: ${browserTasks.reduce((sum, t) => sum + (t.result?.kind === 'browser' ? t.result.links.length : 0), 0)}`,
    `- browser assignment mismatch: ${browserAssignmentMismatch.length}`,
    '',
    '## Hook Verdict',
    `- passed: ${verdictPassed}`,
    `- testsOk: ${test.ok}`,
    `- runFailed: ${failedTasks.length > 0}`,
    `- runBlocked: ${blockedTasks.length > 0}`,
    `- taskCount: ${state.tasks.length}`,
    '```',
    test.output || '(no test output)',
    '```'
  ].join('\n');

  fs.writeFileSync(fullPath, markdown, 'utf8');

  return {
    kind: 'cross-surface-check',
    path: fullPath,
    summary: `cross-surface verification generated (passed=${verdictPassed}, testsOk=${test.ok})`
  };
}
