import { spawn } from 'node:child_process';

import { AppError } from './errors.js';
import type { WorkerName, WorkerRunResult } from './types.js';

interface RunCommandOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

function runCommand(
  command: string,
  args: string[],
  { timeoutMs = 120000, cwd = process.cwd(), env = process.env }: RunCommandOptions = {}
): Promise<WorkerRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, shell: false });
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer | string) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer | string) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, killedByTimeout });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}`.trim(), killedByTimeout });
    });
  });
}

interface RunWorkerTaskArgs {
  worker: WorkerName;
  prompt: string;
  timeoutMs?: number;
}

export async function runWorkerTask({ worker, prompt, timeoutMs = 120000 }: RunWorkerTaskArgs): Promise<WorkerRunResult> {
  if (worker === 'codex') {
    return runCommand('codex', [prompt], { timeoutMs });
  }

  if (worker === 'claude') {
    return runCommand('claude', [prompt], { timeoutMs });
  }

  throw new AppError(`지원하지 않는 워커입니다: ${worker}`, 'UNSUPPORTED_WORKER');
}
